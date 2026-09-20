export const RELAY_CONFIG = {
  maximumRelayDistance: 2500,
  packetLifetime: 10000,
  relayDelay: 800,
};

export function createSurvivorPacket(
  sourceDrone,
  latitude,
  longitude
) {
  return {
    packetId: `SURV-${Date.now()}`,
    type: "SURVIVOR_GPS",
    source: sourceDrone,
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    timestamp: new Date().toISOString(),
    status: "CREATED",
    hops: 0,
    route: [sourceDrone],
  };
}


export function distanceBetweenGPS(
  latitude1,
  longitude1,
  latitude2,
  longitude2
) {
  const earthRadius = 6371000;

  const lat1 =
    (latitude1 * Math.PI) / 180;

  const lat2 =
    (latitude2 * Math.PI) / 180;

  const deltaLat =
    ((latitude2 - latitude1) * Math.PI) / 180;

  const deltaLon =
    ((longitude2 - longitude1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadius * c;
}


export function findNearestRelay(
  sourceDrone,
  drones
) {
  let nearestDrone = null;
  let nearestDistance = Infinity;

  drones.forEach((drone) => {
    if (drone.id === sourceDrone.id) {
      return;
    }

    const distance =
      distanceBetweenGPS(
        sourceDrone.latitude,
        sourceDrone.longitude,
        drone.latitude,
        drone.longitude
      );

    if (
      distance < nearestDistance &&
      distance <=
        RELAY_CONFIG.maximumRelayDistance
    ) {
      nearestDistance = distance;
      nearestDrone = drone;
    }
  });

  if (!nearestDrone) {
    return null;
  }

  return {
    drone: nearestDrone,
    distance: nearestDistance,
  };
}


/*
 * Build a multi-hop relay route.
 *
 * Example:
 *
 * DRONE-03
 *    ↓
 * DRONE-01
 *    ↓
 * DRONE-02
 *    ↓
 * GCS
 */

export function buildRelayRoute(
  sourceDrone,
  drones
) {
  const route = [
    sourceDrone.id,
  ];

  const visited = new Set();

  visited.add(
    sourceDrone.id
  );

  let currentDrone =
    sourceDrone;

  while (true) {

    const availableDrones =
      drones.filter(
        (drone) =>
          !visited.has(drone.id)
      );

    const relay =
      findNearestRelay(
        currentDrone,
        availableDrones
      );

    if (!relay) {
      break;
    }

    const relayDrone =
      relay.drone;

    route.push(
      relayDrone.id
    );

    visited.add(
      relayDrone.id
    );

    currentDrone =
      relayDrone;
  }

  route.push("GCS");

  return route;
}


export function forwardPacket(
  packet,
  relayDrone
) {
  if (!packet) {
    return null;
  }

  return {
    ...packet,

    status: "RELAYING",

    hops:
      packet.hops + 1,

    route: [
      ...packet.route,
      relayDrone.id,
    ],
  };
}


export function deliverPacketToGCS(
  packet
) {
  if (!packet) {
    return null;
  }

  return {
    ...packet,

    status: "RECEIVED",

    deliveredAt:
      new Date().toISOString(),

    route: [
      ...packet.route,
      "GCS",
    ],
  };
}