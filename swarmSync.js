/* =========================================================
   AEROCUE SWARM SYNCHRONIZATION ENGINE

   All drones must reach the same waypoint before the
   swarm advances to the next waypoint.
========================================================= */


/* =========================================================
   CHECK WHETHER ALL DRONES REACHED THEIR CURRENT WAYPOINT
========================================================= */

export function allDronesAtWaypoint(drones, mission) {
  if (
    !drones ||
    !mission ||
    !mission.strips ||
    drones.length === 0
  ) {
    return false;
  }

  return drones.every((drone) => {
    const strip = mission.strips.find(
      (item) => item.droneId === drone.id
    );

    if (!strip) {
      return false;
    }

    const currentWaypoint = drone.waypoint;

    const targetWaypoint =
      strip.waypoints[currentWaypoint - 1];

    /*
     * No target means this drone has completed
     * its assigned strip.
     */
    if (!targetWaypoint) {
      return true;
    }

    /*
     * A drone is considered synchronized when
     * its GPS exactly matches its current waypoint.
     */
    return (
      drone.latitude === targetWaypoint.latitude &&
      drone.longitude === targetWaypoint.longitude
    );
  });
}


/* =========================================================
   CHECK WHETHER THE ENTIRE SWARM COMPLETED THE MISSION
========================================================= */

export function swarmMissionComplete(drones, mission) {
  if (
    !drones ||
    !mission ||
    !mission.strips
  ) {
    return false;
  }

  return drones.every((drone) => {
    const strip = mission.strips.find(
      (item) => item.droneId === drone.id
    );

    if (!strip) {
      return false;
    }

    return (
      drone.waypoint >=
      strip.waypoints.length
    );
  });
}


/* =========================================================
   GET CURRENT WAYPOINT FOR A DRONE
========================================================= */

export function getSwarmWaypoint(drone, mission) {
  if (
    !drone ||
    !mission ||
    !mission.strips
  ) {
    return null;
  }

  const strip = mission.strips.find(
    (item) => item.droneId === drone.id
  );

  if (!strip) {
    return null;
  }

  return (
    strip.waypoints[drone.waypoint - 1] ||
    null
  );
}


/* =========================================================
   GET CURRENT SYNCHRONIZATION STATUS
========================================================= */

export function getSyncStatus(drones, mission) {
  if (
    !drones ||
    !mission ||
    !mission.strips
  ) {
    return {
      synchronized: false,
      waiting: false,
      complete: false,
    };
  }

  const complete =
    swarmMissionComplete(
      drones,
      mission
    );

  if (complete) {
    return {
      synchronized: true,
      waiting: false,
      complete: true,
    };
  }

  const synchronized =
    allDronesAtWaypoint(
      drones,
      mission
    );

  return {
    synchronized,
    waiting: !synchronized,
    complete: false,
  };
}