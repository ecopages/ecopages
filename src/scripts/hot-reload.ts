import { WS_HOT_RELOAD_URL, RELOAD_COMMAND } from "root/eco.constants";

(function () {
  let socket: WebSocket;

  // Function to initialize the WebSocket connection
  function initSocket() {
    socket = new WebSocket(`ws://localhost:3000${WS_HOT_RELOAD_URL}`);

    socket.onmessage = function (msg) {
      if (msg.data === RELOAD_COMMAND) {
        location.reload();
      }
    };

    console.log("Live reload enabled.");
  }

  // Initialize the WebSocket connection
  initSocket();

  // Listen for page visibility change events
  document.addEventListener("visibilitychange", function () {
    // If the page is visible, try to reconnect
    if (document.visibilityState === "visible") {
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
