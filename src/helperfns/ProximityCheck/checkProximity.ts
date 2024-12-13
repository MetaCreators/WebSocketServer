import { User } from "../../types/Usertypes";

const PROXIMITY_THRESHOLD = 80;

interface NearbyUsersMap {
  [userId: number]: number[];
}

export default function checkProximity(allUsers: Map<number, User>): NearbyUsersMap | null {
  const nearbyUsersMap: NearbyUsersMap = {};

  const usersArray = Array.from(allUsers.entries());

  for (let i = 0; i < usersArray.length-1; i++) {
    const [userId1, user1] = usersArray[i];
    nearbyUsersMap[userId1] = [];

    for (let j = i + 1; j < usersArray.length; j++) {
      const [userId2, user2] = usersArray[j];
      
      const distance = Math.sqrt(
        Math.pow(user1.position.x - user2.position.x, 2) + 
        Math.pow(user1.position.y - user2.position.y, 2)
      );

      if (distance < PROXIMITY_THRESHOLD) {
        nearbyUsersMap[userId1].push(userId2);
        
        if (!nearbyUsersMap[userId2]) {
          nearbyUsersMap[userId2] = [];
        }
        nearbyUsersMap[userId2].push(userId1);
      }
    }

    if (nearbyUsersMap[userId1].length === 0) {
      delete nearbyUsersMap[userId1];
    }
  }

  return Object.keys(nearbyUsersMap).length > 0 ? nearbyUsersMap : null;
}