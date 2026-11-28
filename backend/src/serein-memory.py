"""Use the installed Serein writer and its transaction/index queue."""
import json
import os
import sys
from datetime import datetime
from uuid import uuid4

from serein.core.store import Conflict, Store
from serein.core.writer import Writer

db = os.environ["ECHO_SEREIN_DATABASE"]


def project(doc):
    meta = doc["metadata"]
    extra = meta.get("echo_fields", {})
    scene = doc["kind"] == "scene"
    body = doc["body_md"]
    narrative = doc["kind"] == "narrative" and "legacy_registry" in meta
    if narrative:
        from serein.compat.germany.narrative_rolls import _extract_body
        body = _extract_body(body)
    editable_summary = narrative or (doc["kind"] == "event" and meta.get("item_type") == "event")
    return {**extra, "id": doc["id"], "title": doc["title"], "text": body, "summaryEditable": editable_summary and not meta.get("source_record_immutable") and doc["lifecycle"] == "active",
            "tab": extra.get("tab", "text" if scene else "summary"),
            "kind": extra.get("kind", "scene" if scene else "event"),
            "pinned": extra.get("pinned", False), "version": doc["revision"],
            "shared": True, "readonly": not scene or bool(meta.get("source_record_immutable")),
            "origin": meta.get("echo_origin", "Serein"),
            "cues": meta.get("scene_cues", []), "domain": meta.get("canonical_domain", ""),
            "date": meta.get("date", ""), "status": doc["lifecycle"],
            "updatedAt": int(datetime.fromisoformat(doc["updated_at"]).timestamp()*1000)}


def mutate(writer, op, data):
    store = writer.store
    if op == "create":
        doc = None
        fields = {}
        meta = {"object_kind": "scene", "memory_value_source": "authored_scene",
                "write_contract": "write-scene-v1", "echo_origin": "Echo"}
    else:
        doc = store.read(data["id"])
        if not doc or doc["lifecycle"] == "deleted" or doc["revision"] != data.get("version"):
            raise Conflict("stale")
        if doc["kind"] != "scene" or doc["metadata"].get("source_record_immutable"):
            raise ValueError("readonly")
        meta = dict(doc["metadata"])
        fields = dict(meta.get("echo_fields", {}))
    fields.update({k: v for k, v in data.items() if k in (
        "tab", "kind", "source", "favorite", "importance", "preference", "pinned", "createdAt")})
    title = data.get("title") or (doc and doc["title"]) or data["text"][:40]
    content = data["text"] if "text" in data else doc["body_md"]
    status = "deleted" if op == "delete" else data.get("status", doc["lifecycle"] if doc else "active")
    domain = data.get("domain", meta.get("canonical_domain")) or "general"
    meta.update(echo_fields=fields, canonical_domain=domain, domain=[domain],
                date=data.get("date", meta.get("date", "")),
                scene_cues=data.get("cues", meta.get("scene_cues")) or [title[:80]],
                scene_status=status, active=status == "active")
    request = {"kind": "scene", "title": title, "body_md": content, "metadata": meta}
    if doc:
        request.update(document_id=doc["id"], expected_revision=doc["revision"])
    key = data.get("operation") or str(uuid4())
    result = writer.execute(key, "save", request)
    if status != (doc["lifecycle"] if doc else "active"):
        store.set_lifecycle(result["id"], status)
    return project(store.read(result["id"]))


def main(op, data):
    if op == "list":
        with Store(db, read_only=True) as store, store.transaction():
            return [project(store.read(row[0])) for row in store.conn.execute(
                "SELECT id FROM documents WHERE kind IN ('scene','event','narrative') AND lifecycle IN ('active','archived')")]
    if op == "summary":
        with Store(db, read_only=True) as store, store.transaction():
            doc = store.read(data["id"])
            if not doc or doc["revision"] != data["version"] or not project(doc)["summaryEditable"]:
                raise Conflict("summary changed")
            if doc["kind"] == "event":
                token = store.conn.execute("SELECT updated_at FROM fact_events WHERE item_id=?", (doc["id"],)).fetchone()[0]
        if doc["kind"] == "event":
            from serein.compat.events import Events
            result = Events(db).edit(doc["id"], token, content=data["text"])
        else:
            from serein.compat.narratives import narrative_transaction
            with narrative_transaction(db, write=True) as rolls:
                current = rolls.read(doc["id"])
                result = rolls.save_body(doc["id"], data["text"], expected_revision=data["version"],
                                         expected_document_sha256=current["document_sha256"])
        if result["status"] == "invalid":
            return {"invalidSummary": True}
        if result["status"] not in ("unchanged", "updated", "superseded"):
            raise Conflict("summary changed")
        return True
    with Writer(db) as writer, writer.store.transaction(immediate=True):
        if op == "import":
            for item in data:
                key = "echo-legacy:" + item["id"]
                if not writer.store.conn.execute("SELECT 1 FROM write_receipts WHERE operation_id=?", (key,)).fetchone():
                    mutate(writer, "create", {**item, "operation": key})
            return True
        return mutate(writer, op, data)


try:
    print(json.dumps(main(sys.argv[1], json.load(sys.stdin))))
except Conflict:
    print(json.dumps({"conflict": True}))
