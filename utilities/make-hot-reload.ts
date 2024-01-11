export function makeHotReloadScript({
  wsUrl,
  reloadCommand,
}: {
  wsUrl: string;
  reloadCommand: string;
}) {
  return `
<!-- start bun live reload script -->
<script type="text/javascript">
 (function() {
  let socket;

  // Function to initialize the WebSocket connection
  function initSocket() {
    socket = new WebSocket("ws://${wsUrl}");

    socket.onmessage = function(msg) {
      if(msg.data === '${reloadCommand}') {
        location.reload()
      }
    };

    console.log('Live reload enabled.');
  }

  // Initialize the WebSocket connection
  initSocket();

  // Listen for page visibility change events
  document.addEventListener('visibilitychange', function() {
    // If the page is visible, try to reconnect
    if (document.visibilityState === 'visible') {
      if (socket.readyState !== WebSocket.OPEN) {
        // Close the old socket if it's not already closed
        if (socket.readyState !== WebSocket.CLOSED) {
          socket.close();
        }

        // Initialize a new socket
        initSocket();
      }
    }
  });
 })();
</script>
<!-- end bun live reload script -->
`;
}
