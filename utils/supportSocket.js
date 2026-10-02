const { Server } = require("socket.io");

let ioInstance = null;

/**
 * 🎧 Initialize Socket.io WebSockets for Real-time Customer Support Conversations
 */
function initSupportSocket(httpServer) {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PATCH", "DELETE"],
      credentials: true,
    },
    pingTimeout: 60000,
  });

  ioInstance.on("connection", (socket) => {
    // 1. Join a specific support ticket conversation room
    socket.on("join_ticket", (ticketId) => {
      if (ticketId) {
        socket.join(`ticket_${ticketId}`);
      }
    });

    // 2. Leave support ticket room
    socket.on("leave_ticket", (ticketId) => {
      if (ticketId) {
        socket.leave(`ticket_${ticketId}`);
      }
    });

    // 3. Developer/Admin Support Channel (for global queue updates)
    socket.on("join_admin_support", () => {
      socket.join("admin_support_channel");
    });

    socket.on("leave_admin_support", () => {
      socket.leave("admin_support_channel");
    });

    // 4. Live Typing Indicator
    socket.on("typing", (data) => {
      if (data?.ticketId) {
        socket.to(`ticket_${data.ticketId}`).emit("user_typing", {
          ticketId: data.ticketId,
          username: data.username,
          role: data.role,
          isTyping: Boolean(data.isTyping),
        });
      }
    });

    socket.on("disconnect", () => {
      // client disconnected
    });
  });

  return ioInstance;
}

function getIO() {
  return ioInstance;
}

/**
 * Broadcast when a new support ticket is raised by a student
 */
function broadcastNewTicket(ticket) {
  if (ioInstance) {
    ioInstance.to("admin_support_channel").emit("new_ticket_created", {
      ticket,
      timestamp: new Date(),
    });
  }
}

/**
 * Broadcast when a new message/reply is added to a ticket
 */
function broadcastTicketMessage(ticketId, message, ticket) {
  if (ioInstance && ticketId) {
    // Send to anyone viewing this specific ticket (user or admin)
    ioInstance.to(`ticket_${ticketId}`).emit("ticket_message", {
      ticketId,
      message,
      ticket,
      timestamp: new Date(),
    });

    // Also notify global admin queue to update message counters
    ioInstance.to("admin_support_channel").emit("ticket_message_admin_notify", {
      ticketId,
      message,
      ticket,
      timestamp: new Date(),
    });
  }
}

/**
 * Broadcast status transitions (Open -> In Progress -> Resolved -> Closed)
 */
function broadcastTicketStatusUpdate(ticketId, updateData, ticket) {
  if (ioInstance && ticketId) {
    ioInstance.to(`ticket_${ticketId}`).emit("ticket_status_updated", {
      ticketId,
      status: updateData.status,
      resolutionNotes: updateData.resolutionNotes,
      ticket,
      timestamp: new Date(),
    });

    ioInstance.to("admin_support_channel").emit("ticket_status_updated", {
      ticketId,
      status: updateData.status,
      resolutionNotes: updateData.resolutionNotes,
      ticket,
      timestamp: new Date(),
    });
  }
}

/**
 * Broadcast ticket deletion
 */
function broadcastTicketDeleted(ticketId) {
  if (ioInstance && ticketId) {
    ioInstance.to(`ticket_${ticketId}`).emit("ticket_deleted", { ticketId });
    ioInstance.to("admin_support_channel").emit("ticket_deleted", { ticketId });
  }
}

module.exports = {
  initSupportSocket,
  getIO,
  broadcastNewTicket,
  broadcastTicketMessage,
  broadcastTicketStatusUpdate,
  broadcastTicketDeleted,
};
