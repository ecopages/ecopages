export function streamBodyResponse(bodyStream: BodyInit | null | undefined) {
  return new Response(bodyStream, {
    headers: {
      "Content-Type": "text/html",
    },
  });
}
