import { WebSocket } from "ws";
import { User } from "../../types/Usertypes";

export function CreateNewUser(connectedUsers:Map<number, User>,ws:WebSocket) {
    const userId = connectedUsers.size;

    const newUser: User = {
        id: userId,
        ws: ws,
        position: {
        x: 0,
        y: 0
        }
    };

    connectedUsers.set(userId, newUser);

    return userId;

}