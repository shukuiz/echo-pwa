# Echo 项目约定

每次更新都在 lib/release.ts 写一条用户能看懂的更新公告，并更换版本标识。写清用户在哪里能看到变化，以及哪些功能需要后端接通。

更新公告统一使用 lib/version.ts 和 components/UpdateNotes.tsx，首页和设置使用同一个公告。lib/release.ts 保留本次交付记录。
