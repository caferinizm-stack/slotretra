export default {
  async fetch(request, env, ctx) {
    // Serve index.html for all routes (SPA fallback)
    if (request.method === "GET") {
      return new Response(fetch(new Request("/index.html", request)).then(res => res.body), {
        headers: { "content-type": "text/html" }
      });
    }
    return new Response("Not Found", { status: 404 });
  }
};