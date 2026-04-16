import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

export const useSocket = (serverUrl, joined, roomId, userName, userColor, userId, token) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!joined) return;

    const newSocket = io(serverUrl, { autoConnect: false });
    newSocket.connect();

    newSocket.emit("join-room", {
      roomId,
      userName,
      color: userColor,
      userId,
      token
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [serverUrl, joined, roomId, userName, userColor, userId, token]);

  return socket;
};
