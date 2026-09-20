/* =========================================================
   AEROCUE SWARM LAG ENGINE

   Lag is measured along each drone's assigned search strip.

   This is important because the drones are intentionally
   separated laterally across parallel search strips.

   A drone is considered lagging when its search progress
   falls more than 100 metres behind the leading drone.
========================================================= */

const LAG_THRESHOLD_METERS = 100;


/* =========================================================
   GPS DISTANCE
========================================================= */

export function distanceBetweenGPS(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const earthRadius = 6371000;

  const latitude1 =
    (lat1 * Math.PI) / 180;

  const latitude2 =
    (lat2 * Math.PI) / 180;

  const deltaLatitude =
    ((lat2 - lat1) * Math.PI) / 180;

  const deltaLongitude =
    ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(deltaLongitude / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadius * c;
}


/* =========================================================
   CALCULATE SEARCH PROGRESS

   Returns approximate metres travelled through the
   assigned search strip.

   Example:

   WP1 ---- WP2 ---- WP3 ---- WP4

   A drone halfway between WP2 and WP3 has progress
   approximately:

   2 + 0.5 = 2.5 waypoint segments
========================================================= */

export function getDroneProgress(
  drone,
  mission
) {
  if (
    !drone ||
    !mission ||
    !mission.strips
  ) {
    return 0;
  }

  const strip =
    mission.strips.find(
      (item) =>
        item.droneId === drone.id
    );

  if (
    !strip ||
    !strip.waypoints ||
    strip.waypoints.length < 2
  ) {
    return 0;
  }

  const waypointIndex =
    Math.max(
      1,
      Math.min(
        drone.waypoint || 1,
        strip.waypoints.length
      )
    );

  let completedDistance = 0;

  /*
   * Add all completed waypoint segments.
   */

  for (
    let index = 0;
    index < waypointIndex - 1;
    index++
  ) {
    const current =
      strip.waypoints[index];

    const next =
      strip.waypoints[index + 1];

    completedDistance +=
      distanceBetweenGPS(
        current.latitude,
        current.longitude,
        next.latitude,
        next.longitude
      );
  }

  /*
   * Add partial distance from the current waypoint
   * toward the next waypoint.
   */

  if (
    waypointIndex <
    strip.waypoints.length
  ) {
    const currentWaypoint =
      strip.waypoints[
        waypointIndex - 1
      ];

    const nextWaypoint =
      strip.waypoints[
        waypointIndex
      ];

    completedDistance +=
      distanceBetweenGPS(
        currentWaypoint.latitude,
        currentWaypoint.longitude,
        drone.latitude,
        drone.longitude
      );
  }

  return completedDistance;
}


/* =========================================================
   CALCULATE LAG FOR THE ENTIRE SWARM

   We compare search progress rather than physical GPS
   separation.

   This prevents the parallel-strip geometry from being
   mistaken for swarm lag.
========================================================= */

export function findLaggingDrones(
  drones,
  mission
) {
  if (
    !drones ||
    drones.length === 0 ||
    !mission
  ) {
    return [];
  }

  const progressData =
    drones.map((drone) => ({
      ...drone,

      progressMeters:
        getDroneProgress(
          drone,
          mission
        ),
    }));

  const leadingProgress =
    Math.max(
      ...progressData.map(
        (drone) =>
          drone.progressMeters
      )
    );

  return progressData
    .map((drone) => {
      const lagDistance =
        Math.max(
          0,
          leadingProgress -
            drone.progressMeters
        );

      return {
        ...drone,

        lagDistance,

        isLagging:
          lagDistance >
          LAG_THRESHOLD_METERS,
      };
    })
    .filter(
      (drone) =>
        drone.isLagging
    );
}


/* =========================================================
   CHECK WHETHER SWARM HOLD IS REQUIRED
========================================================= */

export function shouldHoldSwarm(
  drones,
  mission
) {
  const laggingDrones =
    findLaggingDrones(
      drones,
      mission
    );

  return {
    hold:
      laggingDrones.length > 0,

    laggingDrones,

    threshold:
      LAG_THRESHOLD_METERS,
  };
}


/* =========================================================
   GET DISPLAY STATUS
========================================================= */

export function getLagStatus(
  drones,
  mission
) {
  const result =
    shouldHoldSwarm(
      drones,
      mission
    );

  if (result.hold) {
    const names =
      result.laggingDrones
        .map(
          (drone) =>
            drone.id
        )
        .join(", ");

    return {
      state: "SWARM HOLD",

      message:
        `${names} is more than ${result.threshold} m behind the swarm.`,

      laggingDrones:
        result.laggingDrones,

      threshold:
        result.threshold,
    };
  }

  return {
    state: "SWARM NOMINAL",

    message:
      "All drones are within the allowed swarm distance.",

    laggingDrones: [],

    threshold:
      LAG_THRESHOLD_METERS,
  };
}


/* =========================================================
   EXPORT THRESHOLD
========================================================= */

export {
  LAG_THRESHOLD_METERS,
};