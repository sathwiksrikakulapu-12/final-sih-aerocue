export function generateSearchMission(
  area,
  droneCount = 3,
  pointsPerStrip = 6
) {
  if (!area) {
    throw new Error("Search area is required.");
  }

  const {
    north,
    south,
    west,
    east,
  } = area;

  if (north <= south || east <= west) {
    throw new Error(
      "Invalid search area coordinates."
    );
  }

  if (droneCount < 1) {
    throw new Error(
      "At least one drone is required."
    );
  }

  if (pointsPerStrip < 2) {
    throw new Error(
      "Each strip requires at least two waypoints."
    );
  }

  const latitudeStep =
    (north - south) /
    (droneCount + 1);

  const strips = [];

  for (
    let droneIndex = 0;
    droneIndex < droneCount;
    droneIndex++
  ) {
    const latitude =
      north -
      latitudeStep *
        (droneIndex + 1);

    const waypoints = [];

    for (
      let pointIndex = 0;
      pointIndex < pointsPerStrip;
      pointIndex++
    ) {
      /*
       * WEST → EAST
       *
       * Every drone uses the exact
       * same longitude progression.
       *
       * No alternating/reverse direction.
       */

      const progress =
        pointIndex /
        (pointsPerStrip - 1);

      const longitude =
        west +
        (east - west) *
          progress;

      waypoints.push({
        waypoint:
          pointIndex + 1,

        latitude:
          Number(
            latitude.toFixed(6)
          ),

        longitude:
          Number(
            longitude.toFixed(6)
          ),
      });
    }

    strips.push({
      stripId:
        `STRIP-${String(
          droneIndex + 1
        ).padStart(2, "0")}`,

      droneId:
        `DRONE-${String(
          droneIndex + 1
        ).padStart(2, "0")}`,

      waypoints,
    });
  }

  return {
    area,
    droneCount,
    strips,

    totalWaypoints:
      strips.reduce(
        (total, strip) =>
          total +
          strip.waypoints.length,
        0
      ),

    generatedAt:
      new Date().toISOString(),
  };
}


export function flattenWaypoints(
  mission
) {
  if (
    !mission ||
    !mission.strips
  ) {
    return [];
  }

  return mission.strips.flatMap(
    (strip) =>
      strip.waypoints.map(
        (waypoint) => ({
          ...waypoint,
          stripId:
            strip.stripId,
          droneId:
            strip.droneId,
        })
      )
  );
}


export function getNextWaypoint(
  mission,
  droneId,
  currentWaypoint = 0
) {
  if (
    !mission ||
    !mission.strips
  ) {
    return null;
  }

  const strip =
    mission.strips.find(
      (item) =>
        item.droneId ===
        droneId
    );

  if (!strip) {
    return null;
  }

  return (
    strip.waypoints[
      currentWaypoint
    ] || null
  );
}