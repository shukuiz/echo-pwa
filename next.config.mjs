/** @type {import('next').NextConfig} */
const backendPort = process.env.ECHO_BACKEND_PORT || "8787";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // 线上只暴露 Next 一个端口，/api/* 由服务端转发给本机轻量后端；
    // 浏览器侧不接触后端地址和 Key。
    return [
      {
        source: "/api/:path*",
        destination: `http://127.0.0.1:${backendPort}/api/:path*`,
      },
    ];
  },
};
export default nextConfig;
