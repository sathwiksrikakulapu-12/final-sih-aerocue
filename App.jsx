import { useEffect, useState } from "react";

import {
  Sun,
  Moon,
  ChevronDown,
  ChevronUp,
  Plane,
  Map,
  Radio,
  Video,
  Bot,
  Gamepad2,
  Terminal,
  Satellite,
  Activity,
  Battery,
  Navigation,
  Users,
  Crosshair,
  Wifi,
} from "lucide-react";

import { initialDrones, GCS_LOCATION } from "./droneData";
import TelemetryPanel from "./components/TelemetryPanel";
import MissionPlanner from "./components/MissionPlanner";
import MissionPaths from "./components/MissionPaths";

import {
  allDronesAtWaypoint,
  swarmMissionComplete,
} from "./swarmSync";

import {
  getLagStatus,
} from "./swarmLag";

import {
  createSurvivorPacket,
  buildRelayRoute,
  forwardPacket,
  deliverPacketToGCS,
} from "./relayNetwork";

import "./App.css";


/* =========================================================
   COLLAPSIBLE PANEL
========================================================= */

function Panel({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={`panel ${
        open ? "panel-open" : "panel-closed"
      }`}
    >
      <div
        className="panel-header"
        onClick={() => setOpen(!open)}
      >
        <div className="panel-title">
          <Icon size={17} />
          <span>{title}</span>
        </div>

        <button className="collapse-button">
          {open ? (
            <ChevronUp size={17} />
          ) : (
            <ChevronDown size={17} />
          )}
        </button>
      </div>

      {open && (
        <div className="panel-content">
          {children}
        </div>
      )}
    </section>
  );
}


/* =========================================================
   GPS → MAP POSITION
========================================================= */

function gpsToMapPosition(latitude, longitude) {
  const minLatitude = 13.0785;
  const maxLatitude = 13.0865;

  const minLongitude = 80.2700;
  const maxLongitude = 80.2850;

  const left =
    ((longitude - minLongitude) /
      (maxLongitude - minLongitude)) *
    100;

  const top =
    ((maxLatitude - latitude) /
      (maxLatitude - minLatitude)) *
    100;

  return {
    left: `${Math.max(
      4,
      Math.min(96, left)
    )}%`,

    top: `${Math.max(
      8,
      Math.min(92, top)
    )}%`,
  };
}


/* =========================================================
   GPS DISTANCE
   Returns approximate distance in metres.
========================================================= */

function distanceBetweenGPS(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const earthRadius = 6371000;

  const lat1Rad =
    (lat1 * Math.PI) / 180;

  const lat2Rad =
    (lat2 * Math.PI) / 180;

  const deltaLat =
    ((lat2 - lat1) * Math.PI) / 180;

  const deltaLon =
    ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadius * c;
}


/* =========================================================
   GPS HEADING
========================================================= */

function calculateHeading(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const lat1Rad =
    (lat1 * Math.PI) / 180;

  const lat2Rad =
    (lat2 * Math.PI) / 180;

  const deltaLon =
    ((lon2 - lon1) * Math.PI) / 180;

  const y =
    Math.sin(deltaLon) *
    Math.cos(lat2Rad);

  const x =
    Math.cos(lat1Rad) *
      Math.sin(lat2Rad) -
    Math.sin(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.cos(deltaLon);

  const heading =
    (Math.atan2(y, x) * 180) /
    Math.PI;

  return (heading + 360) % 360;
}


/* =========================================================
   MOVE DRONE TOWARD WAYPOINT
========================================================= */

function moveDroneTowardWaypoint(
  drone,
  waypoint,
  movementStep = 0.0007
) {
  if (!waypoint) {
    return {
      ...drone,
      status: "SEARCH COMPLETE",
      speed: 0,
    };
  }

  const deltaLat =
    waypoint.latitude -
    drone.latitude;

  const deltaLon =
    waypoint.longitude -
    drone.longitude;

  const distance =
    Math.sqrt(
      deltaLat ** 2 +
        deltaLon ** 2
    );

  /*
   * Drone has reached the waypoint.
   */

  if (distance < movementStep) {
    return {
      ...drone,

      latitude:
        waypoint.latitude,

      longitude:
        waypoint.longitude,

      speed: 0,
    };
  }


  /*
   * Move a fixed amount toward
   * the target waypoint.
   */

  const ratio =
    movementStep / distance;

  const newLatitude =
    drone.latitude +
    deltaLat * ratio;

  const newLongitude =
    drone.longitude +
    deltaLon * ratio;


  /*
   * Calculate heading toward
   * current waypoint.
   */

  const heading =
    calculateHeading(
      drone.latitude,
      drone.longitude,
      waypoint.latitude,
      waypoint.longitude
    );


  /*
   * Calculate remaining distance
   * in metres.
   */

  const realDistance =
    distanceBetweenGPS(
      drone.latitude,
      drone.longitude,
      waypoint.latitude,
      waypoint.longitude
    );


  return {
    ...drone,

    latitude:
      newLatitude,

    longitude:
      newLongitude,

    heading,

    speed: Math.min(
      15,
      Math.max(
        8,
        realDistance / 4
      )
    ),

    altitude: Math.max(
      60,
      drone.altitude +
        (Math.random() - 0.5) *
          0.8
    ),

    battery: Math.max(
      20,
      drone.battery - 0.01
    ),
  };
}

function moveDroneTowardGCS(
  drone,
  movementStep = 0.00018
) {
  const deltaLat =
    GCS_LOCATION.latitude - drone.latitude;

  const deltaLon =
    GCS_LOCATION.longitude - drone.longitude;

  const distance = Math.sqrt(
    deltaLat ** 2 +
    deltaLon ** 2
  );

  if (distance < movementStep) {
    return {
      ...drone,
      latitude: GCS_LOCATION.latitude,
      longitude: GCS_LOCATION.longitude,
      altitude: 0,
      speed: 0,
      status: "AT GCS",
    };
  }

  const ratio = movementStep / distance;

  const newLatitude =
    drone.latitude + deltaLat * ratio;

  const newLongitude =
    drone.longitude + deltaLon * ratio;

  const heading = calculateHeading(
    drone.latitude,
    drone.longitude,
    GCS_LOCATION.latitude,
    GCS_LOCATION.longitude
  );

  return {
    ...drone,
    latitude: newLatitude,
    longitude: newLongitude,
    heading,
    altitude: Math.max(
      0,
      drone.altitude - 1
    ),
    speed: 10,
    battery: Math.max(
      1,
      drone.battery - 0.015
    ),
    status: "RETURNING",
  };
}


/* =========================================================
   APP
========================================================= */

function App() {

  /* =======================================================
     UI STATE
  ======================================================= */

const [currentTime, setCurrentTime] = useState(new Date());
 useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(clockInterval);
    };
  }, []);

const [darkMode, setDarkMode] =
    useState(true);

const [systemLogs, setSystemLogs] = useState([
  {
    time: new Date(),
    message: "GCS system initialized",
    type: "normal",
  },
]);

const addSystemLog = (message, type = "normal") => {
  setSystemLogs((previousLogs) => [
    ...previousLogs,
    {
      time: new Date(),
      message,
      type,
    },
  ]);
};

const [selectedDrone, setSelectedDrone] =
    useState("DRONE-01");

const [selectedImage, setSelectedImage] =
  useState(null);

const [imagePreview, setImagePreview] =
  useState(null);

const [aiResult, setAiResult] = useState(null);

const [aiLoading, setAiLoading] = useState(false);

const [aiError, setAiError] = useState("");

const [showDetectionModal, setShowDetectionModal] =
  useState(false);

const [detectionZoom, setDetectionZoom] =
  useState(1);

const [selectedDetection, setSelectedDetection] =
  useState(null);

const analyzeSelectedImage = async () => {
  if (!selectedImage) {
    setAiError("SELECT AN IMAGE FIRST");
    return;
  }

  setAiLoading(true);
  setAiError("");
  setAiResult(null);

  try {
    const formData = new FormData();

    formData.append(
      "file",
      selectedImage
    );

    const response = await fetch(
      "http://127.0.0.1:8000/analyze",
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(
        `AI SERVER ERROR: ${response.status}`
      );
    }

    const result =
      await response.json();

    console.log(
      "AI ANALYSIS RESULT:",
      result
    );

    setAiResult(result);

  } catch (error) {

    console.error(
      "AI analysis failed:",
      error
    );

    setAiError(
      "AI SERVER UNAVAILABLE"
    );

  } finally {

    setAiLoading(false);

  }
};
  /* =======================================================
     MISSION STATE
  ======================================================= */

const [relayPacket, setRelayPacket] = useState(null);

const [relayStatus, setRelayStatus] = useState(
  "NETWORK READY"
);

const [relayRoute, setRelayRoute] = useState([]);

const [relayHop, setRelayHop] = useState(0);
  

const [mission, setMission] =
  useState(null);

const [survivors, setSurvivors] =
  useState([]);

const [missionRunning, setMissionRunning] =
  useState(false);

const [missionStatus, setMissionStatus] =
  useState("READY");

const [flightMode, setFlightMode] = useState("AT GCS");

  /* =========================================================
   SWARM LAG STATE
========================================================= */

const [lagStatus, setLagStatus] =
  useState({
    state: "SWARM NOMINAL",

    message:
      "All drones are within the allowed swarm distance.",

    laggingDrones: [],

    threshold: 100,
  });
const [
  simulatedLagDrone,
  setSimulatedLagDrone,
  ] = useState(null);


/* =========================================================
   DRONE STATE
========================================================= */

const [drones, setDrones] =
  useState(
    initialDrones.map((drone) => ({
      ...drone,
      status: "STANDBY",
      waypoint: 1,
    }))
  );


  const simulateSurvivorDetection = () => {
  if (!drones || drones.length === 0) {
    addSystemLog(
      "Cannot simulate survivor: no drones available",
      "normal"
    );
    return;
  }

  const sourceDrone =
    drones.find(
      (drone) => drone.id === selectedDrone
    ) || drones[0];

  const survivorId =
    `SURVIVOR-${Date.now()}`;

  const packet = createSurvivorPacket(
    sourceDrone.id,
    sourceDrone.latitude,
    sourceDrone.longitude
  );

  const aiConfidence = Number(
    (88 + Math.random() * 10).toFixed(1)
  );

  let triageLevel = "LOW";

  if (aiConfidence >= 95) {
    triageLevel = "HIGH";
  } else if (aiConfidence >= 91) {
    triageLevel = "MEDIUM";
  }

  const route = buildRelayRoute(
    sourceDrone,
    drones
  );

  const newSurvivor = {
    id: survivorId,
    latitude: sourceDrone.latitude,
    longitude: sourceDrone.longitude,
    sourceDrone: sourceDrone.id,
    detected: true,
    detectedAt: new Date().toISOString(),
    aiConfidence,
    triageLevel,
    relayRoute: route,
    status: "DETECTED",
  };

  setSurvivors((previousSurvivors) => [
    ...previousSurvivors,
    newSurvivor,
  ]);

  setRelayPacket(packet);
  setRelayStatus("SURVIVOR DETECTED");
  setRelayRoute([sourceDrone.id]);
  setRelayHop(0);

  addSystemLog(
    `Survivor detected by ${sourceDrone.id}`,
    "success"
  );

  addSystemLog(
    `GPS coordinates acquired: ${sourceDrone.latitude.toFixed(6)}, ${sourceDrone.longitude.toFixed(6)}`,
    "normal"
  );

  addSystemLog(
    `Relay route established: ${route.join(" → ")}`,
    "normal"
  );

  const relayDrones = route.slice(1, -1);

  relayDrones.forEach((relayId, index) => {
    setTimeout(() => {
      const relayDrone = drones.find(
        (drone) => drone.id === relayId
      );

      if (!relayDrone) {
        return;
      }

      setRelayPacket((currentPacket) =>
        forwardPacket(
          currentPacket,
          relayDrone
        )
      );

      setRelayRoute(
        route.slice(0, index + 2)
      );

      setRelayHop(index + 1);

      setRelayStatus(
        `RELAYING VIA ${relayDrone.id}`
      );

      setSurvivors(
        (previousSurvivors) =>
          previousSurvivors.map(
            (survivor) =>
              survivor.id === survivorId
                ? {
                    ...survivor,
                    status: "RELAYING",
                  }
                : survivor
          )
      );

      addSystemLog(
        `GPS packet relayed via ${relayDrone.id}`,
        "normal"
      );
    }, (index + 1) * 1000);
  });

  const deliveryDelay =
    (relayDrones.length + 1) * 1000;

  setTimeout(() => {
    setRelayPacket((currentPacket) =>
      deliverPacketToGCS(currentPacket)
    );

    setRelayRoute(route);

    setRelayHop(route.length - 1);

    setRelayStatus(
      "SURVIVOR GPS RECEIVED"
    );

    setSurvivors(
      (previousSurvivors) =>
        previousSurvivors.map(
          (survivor) =>
            survivor.id === survivorId
              ? {
                  ...survivor,
                  status: "GPS RECEIVED",
                }
              : survivor
        )
    );

    addSystemLog(
      `Survivor GPS received at GCS from ${sourceDrone.id}`,
      "success"
    );

  }, deliveryDelay);
};

  /* =======================================================
     MISSION GENERATED
  ======================================================= */

  const handleMissionGenerated = (
    generatedMission
  ) => {

    setMission(
      generatedMission
    );

    setMissionRunning(
      false
    );

    setMissionStatus(
      "READY"
    );


    /*
     * Assign each drone to its
     * generated strip.
     *
     * IMPORTANT:
     *
     * We do NOT teleport the drone
     * to WP1.
     *
     * It starts from its current
     * simulated GPS position and
     * flies toward WP1.
     */

    setDrones(
      (previousDrones) =>
        previousDrones.map(
          (drone) => {

            const strip =
              generatedMission.strips.find(
                (item) =>
                  item.droneId ===
                  drone.id
              );

            if (!strip) {
              return {
                ...drone,

                status:
                  "NO MISSION",

                waypoint: 1,
              };
            }

            return {
              ...drone,

              status:
                "READY",

              waypoint:
                1,

              speed: 0,
            };
          }
        )
    );
  };


  /* =======================================================
     START SEARCH
  ======================================================= */

const startSearch = () => {
  if (!mission) {
    setMissionStatus("NO MISSION");

    addSystemLog(
      "Cannot start search: no mission generated",
      "normal"
    );

    return;
  }

  setMissionRunning(true);
  setFlightMode("SEARCH");
  setMissionStatus("SEARCHING");

  setDrones((previousDrones) =>
    previousDrones.map((drone) => ({
      ...drone,
      status: "SEARCHING",
      speed: drone.speed || 10,
    }))
  );

  addSystemLog(
    "Search mission started",
    "success"
  );

  addSystemLog(
    "All drones entering synchronized search",
    "normal"
  );
};

  /* =======================================================
     PAUSE SEARCH
  ======================================================= */

const pauseSearch = () => {
  if (!missionRunning) {
    addSystemLog(
      "Search mission is not currently running",
      "normal"
    );

    return;
  }

  setMissionRunning(false);
  setMissionStatus("PAUSED");

  setDrones((previousDrones) =>
    previousDrones.map((drone) => ({
      ...drone,
      status: "PAUSED",
      speed: 0,
    }))
  );

  addSystemLog(
    "Search mission paused",
    "normal"
  );

  addSystemLog(
    "All drones holding current positions",
    "normal"
  );
};


  /* =======================================================
     RETURN TO GCS
  ======================================================= */

  /* =======================================================
   RETURN TO GCS
======================================================= */

const returnToGCS = () => {
  setMissionRunning(false);
  setFlightMode("RETURNING");
  setMissionStatus("RETURNING TO GCS");

  setDrones((previousDrones) =>
    previousDrones.map((drone) => ({
      ...drone,
      status: "RETURNING",
      speed: 10,
    }))
  );

  addSystemLog(
    "Return-to-GCS command issued",
    "normal"
  );

  addSystemLog(
    "All drones navigating to GCS",
    "normal"
  );
};


const drainBattery = () => {
  if (!drones || drones.length === 0) {
    addSystemLog(
      "Battery simulation unavailable: no drones",
      "normal"
    );
    return;
  }

  setMissionRunning(false);
  setFlightMode("RETURNING");
  setMissionStatus("LOW BATTERY - RETURNING");

  setDrones((previousDrones) =>
    previousDrones.map((drone) => {
      const distanceToGCS = distanceBetweenGPS(
        drone.latitude,
        drone.longitude,
        GCS_LOCATION.latitude,
        GCS_LOCATION.longitude
      );

      const reserveBattery = Math.max(
        20,
        Math.min(
          45,
          20 + (distanceToGCS / 1000) * 2
        )
      );

      return {
        ...drone,
        battery: Number(reserveBattery.toFixed(0)),
        status: "LOW BATTERY",
        speed: 0,
      };
    })
  );

  addSystemLog(
    "Battery drain simulation activated",
    "normal"
  );

  addSystemLog(
    "GCS calculating return-to-home battery reserve",
    "normal"
  );

  setTimeout(() => {
    setDrones((previousDrones) =>
      previousDrones.map((drone) => ({
        ...drone,
        status: "RETURNING",
        speed: 10,
      }))
    );

    addSystemLog(
      "Battery reserve confirmed - RETURN TO GCS",
      "success"
    );
  }, 1000);
};


/* =======================================================
   SYNCHRONIZED SWARM MOVEMENT ENGINE

   SEARCH MODE:

   D1 → current waypoint
   D2 → current waypoint
   D3 → current waypoint

   A drone that reaches its waypoint waits.

   Only when ALL drones arrive:

                    SYNC
                     ↓
                NEXT WAYPOINT


   RETURN MODE:

   Any RETURNING command causes all drones to
   physically navigate back to the GCS coordinates.
======================================================= */

useEffect(() => {

  /*
   * Continue running when:
   *
   * 1. A search mission is running
   * OR
   * 2. Drones are returning to GCS
   *
   * The second condition is important because
   * missionRunning becomes false during RTH.
   */

  if (
    (!missionRunning &&
      flightMode !== "RETURNING") ||
    !mission
  ) {
    return;
  }


  const interval = setInterval(() => {

    setDrones((previousDrones) => {

      /* =================================================
         RETURN TO GCS MODE
      ================================================= */

      if (flightMode === "RETURNING") {

        const returningDrones =
          previousDrones.map(
            (drone) =>
              moveDroneTowardGCS(
                drone,
                0.00018
              )
          );


        /*
         * Check whether every drone has
         * physically reached the GCS.
         */

        const allAtGCS =
          returningDrones.every(
            (drone) =>
              drone.status === "AT GCS"
          );


        if (allAtGCS) {

          setFlightMode("AT GCS");

          setMissionStatus("READY");

          addSystemLog(
            "All drones reached GCS",
            "success"
          );


          return returningDrones.map(
            (drone) => ({
              ...drone,

              latitude:
                GCS_LOCATION.latitude,

              longitude:
                GCS_LOCATION.longitude,

              altitude: 0,

              speed: 0,

              status: "AT GCS",
            })
          );
        }


        return returningDrones;
      }


      /* =================================================
         SEARCH MODE
      ================================================= */


      /*
       * Determine the current synchronized
       * waypoint number.
       */

      const currentWaypoint =
        Math.max(
          ...previousDrones.map(
            (drone) =>
              drone.waypoint
          )
        );


      /* =================================================
         CHECK CURRENT LAG BEFORE MOVEMENT
      ================================================= */

      const previousLagStatus =
        getLagStatus(
          previousDrones,
          mission
        );


      /*
       * Store IDs of drones that are currently
       * lagging.
       */

      let laggingIds =
        new Set(
          previousLagStatus.laggingDrones.map(
            (drone) =>
              drone.id
          )
        );


      /*
       * Add manually simulated lagging drone.
       */

      if (simulatedLagDrone) {

        laggingIds.add(
          simulatedLagDrone
        );
      }


      /*
       * Determine whether the swarm must hold.
       */

      const swarmHolding =
        previousLagStatus.hold;


      /* =================================================
         MOVE ALL DRONES
      ================================================= */

      const movedDrones =
        previousDrones.map(
          (drone) => {

            /*
             * Find this drone's assigned strip.
             */

            const strip =
              mission.strips.find(
                (item) =>
                  item.droneId ===
                  drone.id
              );


            if (!strip) {
              return drone;
            }


            /*
             * Get this drone's waypoint
             * for the current synchronized
             * waypoint number.
             */

            const targetWaypoint =
              strip.waypoints[
                currentWaypoint - 1
              ];


            /*
             * No waypoint means this drone
             * has completed its strip.
             */

            if (!targetWaypoint) {

              return {
                ...drone,

                status:
                  "SEARCH COMPLETE",

                speed: 0,
              };
            }


            /* =================================================
               SWARM HOLD
            ================================================= */

            /*
             * If another drone is more than
             * 100 m behind, the leading drones
             * stop and wait.
             *
             * The lagging drone continues.
             */

            if (
              swarmHolding &&
              !laggingIds.has(
                drone.id
              )
            ) {

              return {
                ...drone,

                speed: 0,

                status:
                  "SWARM HOLD",
              };
            }


            /* =================================================
               NORMAL MOVEMENT
            ================================================= */

            const movement =
              moveDroneTowardWaypoint(
                drone,
                targetWaypoint,

                /*
                 * Simulated lagging drone
                 * moves much slower.
                 */

                simulatedLagDrone ===
                  drone.id
                  ? 0.000025
                  : 0.00018
              );


            /*
             * Calculate remaining distance
             * to the assigned waypoint.
             */

            const remainingDistance =
              distanceBetweenGPS(
                movement.latitude,
                movement.longitude,
                targetWaypoint.latitude,
                targetWaypoint.longitude
              );


            /* =================================================
               WAYPOINT ARRIVAL
            ================================================= */

            if (
              remainingDistance <
              15
            ) {

              return {
                ...movement,

                latitude:
                  targetWaypoint.latitude,

                longitude:
                  targetWaypoint.longitude,

                waypoint:
                  currentWaypoint,

                speed: 0,

                status:
                  "WAITING FOR SWARM",
              };
            }


            /* =================================================
               CONTINUE SEARCHING
            ================================================= */

            return {
              ...movement,

              waypoint:
                currentWaypoint,

              status:
                simulatedLagDrone ===
                  drone.id
                  ? "LAG SIMULATION"
                  : "SEARCHING",
            };
          }
        );


      /* =================================================
         CHECK LAG AFTER MOVEMENT
      ================================================= */

      const currentLagStatus =
        getLagStatus(
          movedDrones,
          mission
        );


      /*
       * If a manually simulated lagging drone
       * isn't naturally more than 100 m behind,
       * still show it as lagging for the demo.
       */

      if (simulatedLagDrone) {

        const simulatedDrone =
          movedDrones.find(
            (drone) =>
              drone.id ===
              simulatedLagDrone
          );


        if (simulatedDrone) {

          const alreadyDetected =
            currentLagStatus.laggingDrones.some(
              (drone) =>
                drone.id ===
                simulatedLagDrone
            );


          if (!alreadyDetected) {

            currentLagStatus.laggingDrones =
              [
                ...currentLagStatus.laggingDrones,

                {
                  ...simulatedDrone,

                  isLagging: true,
                },
              ];
          }
        }
      }


      /*
       * Update the lag display.
       */

      setLagStatus(
        currentLagStatus
      );


      /* =================================================
         CHECK SWARM SYNCHRONIZATION
      ================================================= */

      const synchronized =
        allDronesAtWaypoint(
          movedDrones,
          mission
        );


      if (synchronized) {

        const finished =
          swarmMissionComplete(
            movedDrones,
            mission
          );


        /* =================================================
           SEARCH COMPLETE
        ================================================= */

        if (finished) {

          setMissionRunning(false);

          setFlightMode(
            "RETURNING"
          );

          setMissionStatus(
            "SEARCH COMPLETE - RETURNING"
          );


          addSystemLog(
            "Search area completely covered",
            "success"
          );

          addSystemLog(
            "All drones returning to GCS",
            "normal"
          );


          return movedDrones.map(
            (drone) => ({
              ...drone,

              status:
                "RETURNING",

              speed: 10,
            })
          );
        }


        /* =================================================
           MOVE TO NEXT WAYPOINT
        ================================================= */

        const nextWaypoint =
          currentWaypoint + 1;


        return movedDrones.map(
          (drone) => ({
            ...drone,

            waypoint:
              nextWaypoint,

            status:
              "SEARCHING",

            speed: 0,
          })
        );
      }


      return movedDrones;
    });

  }, 1000);


  return () =>
    clearInterval(interval);

}, [
  missionRunning,
  mission,
  simulatedLagDrone,
  flightMode,
]);
  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div
      className={`app ${
        darkMode
          ? "dark"
          : "light"
      }`}
    >

      {/* ===================================================
          SIDEBAR REMOVED
      =================================================== */}




      {/* ===================================================
          MAIN
      =================================================== */}

      <main className="main">


        {/* =================================================
            TOP BAR
        ================================================= */}

        <header className="topbar">

          <div className="topbar-left">

            <div className="page-heading">

              <h1>
                Mission Control
              </h1>

              <span>
                Autonomous Drone Search & Rescue
              </span>

            </div>

          </div>


          <div className="topbar-right">

            <div className="connection-status">

              <span className="status-dot"></span>

              <span>
                NETWORK ONLINE
              </span>

            </div>


            <button
              className="theme-button"
              onClick={() =>
                setDarkMode(
                  !darkMode
                )
              }
              title="Toggle theme"
            >

              {darkMode ? (
                <Sun size={19} />
              ) : (
                <Moon size={19} />
              )}

            </button>


            <div className="gcs-time">

              <div>
                GCS
              </div>

              <strong>
                {currentTime.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
                })}
              </strong>

            </div>

          </div>

        </header>


        {/* =================================================
            DASHBOARD
        ================================================= */}

        <div className="dashboard">


          {/* =================================================
              TOP STATS
          ================================================= */}

          <div className="stats-grid">


            {/* ACTIVE DRONES */}

            <div className="stat-card">

              <div className="stat-icon">
                <Plane size={19} />
              </div>

              <div>

                <span className="stat-label">
                  ACTIVE DRONES
                </span>

                <strong>
                  {
                    drones.filter(
                      (drone) =>
                        drone.status !==
                        "SEARCH COMPLETE"
                    ).length
                  }{" "}
                  / 3
                </strong>

              </div>

              <span className="stat-state online">
                ONLINE
              </span>

            </div>


            {/* MISSION STATUS */}

            <div className="stat-card">

              <div className="stat-icon">
                <Navigation size={19} />
              </div>

              <div>

                <span className="stat-label">
                  MISSION STATUS
                </span>

                <strong>
                  {missionStatus}
                </strong>

              </div>

              <span className="stat-state active-state">
                {mission
                  ? "ACTIVE"
                  : "WAITING"}
              </span>

            </div>


            {/* DETECTIONS */}

            <div className="stat-card">

              <div className="stat-icon">
                <Users size={19} />
              </div>

              <div>

                <span className="stat-label">
                  DETECTIONS
                </span>

                <strong>
                  {aiResult?.personCount || 0}
                </strong>

              </div>

              <span className="stat-state warning">
                REVIEW
              </span>

            </div>


            {/* NETWORK */}

            <div className="stat-card">

              <div className="stat-icon">
                <Wifi size={19} />
              </div>

              <div>

                <span className="stat-label">
                  NETWORK
                </span>

                <strong>
                  STABLE
                </strong>

              </div>

              <span className="stat-state online">
                CONNECTED
              </span>

            </div>

          </div>


          {/* =================================================
              MAIN GRID
          ================================================= */}

          <div className="main-grid">


            {/* ===============================================
                LIVE MISSION MAP
            =============================================== */}

            <Panel
              title="LIVE MISSION MAP"
              icon={Map}
            >

              <div className="map-container">
                <div
                className="gcs-marker"
                style={{
                  left: gpsToMapPosition(
                    GCS_LOCATION.latitude,
                    GCS_LOCATION.longitude
                  ).left,
                  top: gpsToMapPosition(
                    GCS_LOCATION.latitude,
                    GCS_LOCATION.longitude
                  ).top,
                }}
              >
                <div className="gcs-icon">
                  GCS
                </div>

                <span>GROUND CONTROL STATION</span>
              </div>

                <div className="map-grid"></div>


                <div className="map-label top-left">
                  SEARCH AREA A
                </div>


                <div className="coordinate-label top-right">

                  {drones[0]?.latitude.toFixed(
                    4
                  )}
                  ° N

                  <br />

                  {drones[0]?.longitude.toFixed(
                    4
                  )}
                  ° E

                </div>


                {/* GENERATED MISSION PATHS */}

                <MissionPaths
                  mission={mission}
                />


                {/* LIVE DRONES */}

                {drones.map(
                  (drone) => {

                    const mapPosition =
                      gpsToMapPosition(
                        drone.latitude,
                        drone.longitude
                      );

                    return (
                      <div
                        className="map-drone"
                        key={drone.id}
                        style={
                          mapPosition
                        }
                        title={`${drone.id} | ${drone.latitude.toFixed(
                          5
                        )}, ${drone.longitude.toFixed(
                          5
                        )}`}
                      >

                        <div className="drone-marker">

                          <Plane size={16} />

                        </div>

                        <span>
                          {drone.shortId}
                        </span>

                      </div>
                    );

                  }
                )}

              {/* SURVIVORS */}

              {survivors.map((survivor, index) => (
                <div
                  key={survivor.id}
                  className="victim-marker"
                  style={{
                    position: "absolute",
                    ...gpsToMapPosition(
                      survivor.latitude,
                      survivor.longitude
                    ),
                    transform: "translate(-50%, -50%)",
                    zIndex: 20,
                  }}
                >
                  <div className="survivor-pulse"></div>

                  <div className="survivor-icon">
                    <Users size={15} />
                  </div>

                  <span>
                    S{index + 1}
                  </span>
                </div>
              ))}


                {/* MAP CONTROLS */}

                <div className="map-controls">

                  <button>
                    +
                  </button>

                  <button>
                    −
                  </button>

                </div>


                <div className="map-scale">
                  500 m
                </div>

              </div>

            </Panel>


            {/* ===============================================
                VIDEO FEED
            =============================================== */}

            <Panel
              title="DRONE VIDEO FEED"
              icon={Video}
            >

              <div className="video-container">

                <div className="video-placeholder">

                  <Video size={38} />

                  <strong>
                    VIDEO FEED
                  </strong>

                  <span>
                    Awaiting simulated camera stream
                  </span>

                </div>


                <div className="video-overlay">

                  <span>
                    {selectedDrone}
                  </span>

                  <span>
                    LIVE
                  </span>

                </div>

              </div>


              <div className="drone-selector">

                {drones.map(
                  (drone) => (

                    <button
                      key={drone.id}
                      className={
                        selectedDrone ===
                        drone.id
                          ? "drone-select active"
                          : "drone-select"
                      }
                      onClick={() =>
                        setSelectedDrone(
                          drone.id
                        )
                      }
                    >

                      <span className="mini-status"></span>

                      {drone.id}

                    </button>

                  )
                )}

              </div>

            </Panel>

          </div>


          {/* =================================================
              GPS & TELEMETRY
          ================================================= */}

          <TelemetryPanel
            drones={drones}
          />


          {/* =================================================
              MISSION PLANNER
          ================================================= */}

          <MissionPlanner
            onMissionGenerated={
              handleMissionGenerated
            }
          />


          {/* =================================================
              DRONE FLEET + AI
          ================================================= */}

          <div className="two-column-grid">


            {/* ===============================================
                DRONE FLEET
            =============================================== */}

            <Panel
              title="DRONE FLEET"
              icon={Plane}
            >

              <div className="drone-list">

                {drones.map(
                  (drone) => (

                    <div
                      className="drone-row"
                      key={drone.id}
                    >

                      <div className="drone-identity">

                        <div className="drone-avatar">
                          <Plane size={17} />
                        </div>

                        <div>

                          <strong>
                            {drone.id}
                          </strong>

                          <span>
                            <i></i>
                            {drone.status}
                          </span>

                        </div>

                      </div>


                      <div className="drone-data">

                        <div>

                          <span>
                            GPS
                          </span>

                          <strong>
                            {drone.latitude.toFixed(
                              4
                            )}
                            ,{" "}
                            {drone.longitude.toFixed(
                              4
                            )}
                          </strong>

                        </div>


                        <div>

                          <span>
                            ALT
                          </span>

                          <strong>
                            {drone.altitude.toFixed(
                              1
                            )}{" "}
                            m
                          </strong>

                        </div>


                        <div>

                          <span>
                            WP
                          </span>

                          <strong>
                            {drone.waypoint}
                          </strong>

                        </div>


                        <div className="battery">

                          <Battery size={15} />

                          <strong>
                            {drone.battery.toFixed(
                              0
                            )}
                            %
                          </strong>

                        </div>

                      </div>

                    </div>

                  )
                )}

              </div>

            </Panel>


{/* ===============================================
AI DETECTION
=============================================== */}

            

<Panel
  title="AI DETECTION"
  icon={Bot}
>

  <div className="ai-layout">

    {/* IMAGE INPUT */}

    <div className="ai-upload">

{imagePreview ? (

  <div
    onClick={() => {
      if (aiResult) {
        setDetectionZoom(1);
        setShowDetectionModal(true);
      }
    }}
    style={{
      width: "100%",
      marginBottom: "14px",
      position: "relative",
      background: "#050a10",
      borderRadius: "6px",
      overflow: "hidden",
      border:
        "1px solid rgba(80, 160, 255, 0.25)",
      cursor: aiResult
        ? "zoom-in"
        : "default",
    }}
  >

    {/* IMAGE + BOXES CONTAINER */}

    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio:
          aiResult?.imageWidth &&
          aiResult?.imageHeight
            ? `${aiResult.imageWidth} / ${aiResult.imageHeight}`
            : "625 / 300",
      }}
    >

      {/* IMAGE */}

      <img
        src={imagePreview}
        alt="Selected drone imagery"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "fill",
          display: "block",
        }}
      />


      {/* YOLO BOXES */}

      {aiResult &&
        aiResult.detections &&
        aiResult.detections.map(
          (detection, index) => {

            const [
              x1,
              y1,
              x2,
              y2,
            ] = detection.bbox;

            const imageWidth =
              aiResult.imageWidth || 1;

            const imageHeight =
              aiResult.imageHeight || 1;

            const left =
              (x1 / imageWidth) * 100;

            const top =
              (y1 / imageHeight) * 100;

            const width =
              ((x2 - x1) /
                imageWidth) *
              100;

            const height =
              ((y2 - y1) /
                imageHeight) *
              100;

            return (
              <div
                key={
                  detection.id ||
                  index
                }
                style={{
                  position: "absolute",

                  left:
                    `${left}%`,

                  top:
                    `${top}%`,

                  width:
                    `${width}%`,

                  height:
                    `${height}%`,

                  border:
                    "2px solid #00ff9d",

                  boxSizing:
                    "border-box",

                  pointerEvents:
                    "none",

                  zIndex: 5,
                }}
              >

                <span
                  style={{
                    position:
                      "absolute",

                    top: "-17px",

                    left: "-2px",

                    background:
                      "#00ff9d",

                    color:
                      "#020608",

                    fontSize: "8px",

                    fontWeight: "700",

                    padding:
                      "2px 4px",

                    whiteSpace:
                      "nowrap",
                  }}
                >
                  {detection.id ||
                    `PERSON-${String(
                      index + 1
                    ).padStart(
                      2,
                      "0"
                    )}`}

                  {" "}

                  {detection.confidence}%
                </span>

              </div>
            );

          }
        )}

    </div>


    {/* INSPECTION HINT */}

    {aiResult &&
      aiResult.detections &&
      aiResult.detections.length > 0 && (

        <div
          style={{
            position:
              "absolute",

            bottom: "7px",

            left: "50%",

            transform:
              "translateX(-50%)",

            background:
              "rgba(0, 0, 0, 0.75)",

            color: "#ffffff",

            padding:
              "4px 7px",

            borderRadius: "4px",

            fontSize: "8px",

            letterSpacing:
              "0.05em",

            pointerEvents:
              "none",

            whiteSpace:
              "nowrap",

            zIndex: 10,
          }}
        >
          CLICK TO INSPECT
        </div>

      )}

  </div>

) : (

  <div className="ai-upload-icon">
    <Bot size={28} />
  </div>

)}

      <span>
        {selectedImage
          ? selectedImage.name
          : "Upload an image from a simulated drone for AI-assisted detection."}
      </span>


      {/* HIDDEN FILE INPUT */}

      <input
        id="survivor-image-input"
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        style={{
          display: "none",
        }}
        onChange={(event) => {

          const file =
            event.target.files?.[0];

          if (!file) {
            return;
          }

          setSelectedImage(file);

          setImagePreview(
            URL.createObjectURL(file)
          );

          setAiResult(null);
          setAiError("");

        }}
      />


      {/* SELECT IMAGE BUTTON */}

      <label
        htmlFor="survivor-image-input"
        className="primary-button"
        style={{
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        SELECT IMAGE
      </label>


      {/* ANALYZE IMAGE BUTTON */}

      {selectedImage && (

        <button
          className="primary-button"
          onClick={analyzeSelectedImage}
          disabled={aiLoading}
          style={{
            marginTop: "10px",
            cursor: aiLoading
              ? "wait"
              : "pointer",
            border: "none",
          }}
        >
          {aiLoading
            ? "ANALYZING..."
            : "ANALYZE IMAGE"}
        </button>

      )}


      {/* STATUS */}

      {selectedImage && !aiLoading && !aiResult && (

        <span
          style={{
            marginTop: "10px",
            color: "#00ff9d",
            fontSize: "10px",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          IMAGE READY FOR ANALYSIS
        </span>

      )}


      {/* AI ERROR */}

      {aiError && (

        <span
          style={{
            marginTop: "10px",
            color: "#ff5c5c",
            fontSize: "10px",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {aiError}
        </span>

      )}

    </div>


    {/* AI RESULTS */}

    <div className="ai-results">

      {/* DETECTION */}

      <div className="result-item">

        <span>
          DETECTION
        </span>

        <strong>
          {aiLoading
            ? "ANALYZING..."
            : aiResult
              ? aiResult.personCount > 0
                ? `${aiResult.personCount} PERSON${
                    aiResult.personCount > 1
                      ? "S"
                      : ""
                  } DETECTED`
                : "NO PERSON DETECTED"
              : selectedImage
                ? "READY FOR ANALYSIS"
                : "NO IMAGE"}
        </strong>

      </div>


      {/* AI CONFIDENCE */}

      <div className="result-item">

        <span>
          AI CONFIDENCE
        </span>

        <strong>
        {aiResult &&
        aiResult.detections &&
        aiResult.detections.length > 0
          ? `${Math.round(
              Math.max(
              ...aiResult.detections.map(
              (detection) => detection.confidence
        )
      ) * 1
    )}%`
  : "--"}
        </strong>

      </div>


      {/* SURVIVAL RISK / TRIAGE */}

      <div className="result-item">

        <span>
          SURVIVAL-RISK / TRIAGE
        </span>

        <strong>
          --
        </strong>

      </div>
      
    </div>

  </div>
  
</Panel>
          {/* =================================================
              GPS RELAY + CONTROL
          ================================================= */}

          <div className="two-column-grid">


            {/* ===============================================
                GPS RELAY NETWORK
            =============================================== */}

{/* GPS RELAY NETWORK */}

<Panel
  title="GPS RELAY NETWORK"
  icon={Radio}
>

  {/* ACTIVE SURVIVOR */}

  {survivors.length > 0 && (
    <div
      style={{
        marginBottom: "18px",
        padding: "10px 12px",
        border: "1px solid rgba(80, 160, 255, 0.2)",
        borderRadius: "6px",
        background: "rgba(20, 35, 55, 0.35)",
      }}
    >
      <span
        style={{
          display: "block",
          fontSize: "9px",
          letterSpacing: "0.08em",
          color: "#6ea8ff",
          marginBottom: "5px",
        }}
      >
        ACTIVE SURVIVOR
      </span>

      <strong
        style={{
          display: "block",
          fontSize: "12px",
        }}
      >
        {survivors[survivors.length - 1].id}
      </strong>

      <span
        style={{
          display: "block",
          marginTop: "4px",
          fontSize: "10px",
          color: "#8b9bb4",
        }}
      >
        SOURCE:{" "}
        {survivors[survivors.length - 1].sourceDrone}
      </span>
    </div>
  )}


  {/* DYNAMIC RELAY ROUTE */}

  <div className="relay-container">

    {relayRoute.length === 0 ? (

      <div
        className="relay-node"
        style={{
          width: "100%",
        }}
      >
        <div className="relay-drone">
          <Plane size={16} />
        </div>

        <strong>
          WAITING
        </strong>

        <span>
          NETWORK IDLE
        </span>
      </div>

    ) : (

      relayRoute.map(
        (node, index) => {

          const isGCS =
            node === "GCS";

          const isSource =
            index === 0;

          const isCurrentHop =
            index === relayHop;

          const isReceived =
            isGCS &&
            relayHop >=
              relayRoute.length - 1;

          return (
            <div
              key={`${node}-${index}`}
              style={{
                display: "contents",
              }}
            >

              {/* NODE */}

              <div
                className="relay-node"
                style={{
                  opacity:
                    index <= relayHop
                      ? 1
                      : 0.45,
                }}
              >

                <div
                  className={
                    isGCS
                      ? "gcs-node"
                      : "relay-drone"
                  }
                  style={{
                    boxShadow:
                      isCurrentHop
                        ? "0 0 18px rgba(80, 160, 255, 0.45)"
                        : "none",
                  }}
                >

                  {isGCS ? (
                    <Crosshair size={17} />
                  ) : (
                    <Plane size={16} />
                  )}

                </div>

                <strong>
                  {node}
                </strong>

                <span>
                  {isGCS
                    ? isReceived
                      ? "RECEIVED"
                      : "GCS"
                    : isSource
                      ? "SOURCE"
                      : "RELAY"}
                </span>

              </div>


              {/* CONNECTION */}

              {index <
                relayRoute.length - 1 && (
                <div className="relay-line">

                  <div
                    className={
                      relayHop >
                      index
                        ? "packet"
                        : "packet inactive"
                    }
                  ></div>

                </div>
              )}

            </div>
          );
        }
      )

    )}

  </div>


  {/* ROUTE SUMMARY */}

  <div
    className="relay-info"
    style={{
      marginTop: "16px",
    }}
  >

    <span>
      ROUTE
    </span>

    <strong>
      {relayRoute.length > 0
        ? relayRoute.join(" → ")
        : "NO ACTIVE ROUTE"}
    </strong>

    <span>
      HOPS: {relayHop}
    </span>

  </div>


  {/* PACKET INFORMATION */}

  <div
    className="relay-info"
    style={{
      marginTop: "10px",
    }}
  >

    <span>
      LAST PACKET
    </span>

    <strong>
      {relayPacket
        ? "SURVIVOR GPS"
        : "NO PACKET"}
    </strong>

    <span>
      {relayPacket
        ? relayPacket.status
        : "WAITING"}
    </span>

  </div>


  {/* NETWORK STATUS */}

  <div
    className="relay-status"
    style={{
      marginTop: "14px",
      fontSize: "11px",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color:
        relayStatus ===
        "SURVIVOR GPS RECEIVED"
          ? "#00ff9d"
          : "#6ea8ff",
    }}
  >
    {relayStatus}
  </div>

</Panel>

            {/* ===============================================
                CONTROL PANEL
            =============================================== */}

                      <Panel
              title="CONTROL PANEL"
              icon={Gamepad2}
            >
              <div className="control-layout">

                <div className="control-group">

                  <span>
                    MISSION CONTROL
                  </span>

                  <div className="control-buttons">

                    <button
                      className="control-primary"
                      onClick={
                        startSearch
                      }
                    >
                      START SEARCH
                    </button>

                    <button
                      onClick={
                        pauseSearch
                      }
                    >
                      PAUSE
                    </button>

                    <button
                      className="danger-button"
                      onClick={
                        returnToGCS
                      }
                    >
                      RETURN TO GCS
                    </button>

                    <button
                      className="control-primary"
                      onClick={
                        simulateSurvivorDetection
                      }
                    >
                      SIMULATE SURVIVOR
                    </button>
                      
                    <button
                      className="danger-button"
                      onClick={drainBattery}
                    >
                      DRAIN BATTERY
                    </button>

                  </div>

                </div>

                <div className="control-group">

                  <span>
                    SELECTED DRONE
                  </span>

                  <select
                    value={
                      selectedDrone
                    }
                    onChange={(e) =>
                      setSelectedDrone(
                        e.target.value
                      )
                    }
                  >

                    {drones.map(
                      (drone) => (

                        <option
                          key={drone.id}
                          value={
                            drone.id
                          }
                        >
                          {drone.id}
                        </option>

                      )
                    )}

                  </select>

                </div>

              </div>
            </Panel>

          {/* =================================================
              SYSTEM TERMINAL
          ================================================= */}

          <Panel
  title="SYSTEM TERMINAL"
  icon={Terminal}
>
  <div className="terminal">

    {systemLogs.map((log, index) => (
      <div
        key={`${log.time.getTime()}-${index}`}
        className={
          log.type === "success"
            ? "terminal-success"
            : ""
        }
      >
        <span>
          [
          {log.time.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          })}
          ]
        </span>

        {log.message}
      </div>
    ))}

    <div className="terminal-cursor">
      GCS&gt; _
    </div>

  </div>
</Panel>

          {/* =================================================
              FOOTER
          ================================================= */}

          <footer className="footer">

            <span>
              AEROCUE GROUND CONTROL STATION
            </span>

            <div>

              <span>
                SIMULATION MODE
              </span>

              <span>
                •
              </span>

              <span>
                HARDWARE INTEGRATION: COMING SOON
              </span>

            </div>

</footer>

</div>

</div>

</div>
{showDetectionModal && imagePreview && (

  <div
    onClick={() =>
      setShowDetectionModal(false)
    }
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      background: "rgba(0, 0, 0, 0.88)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "30px",
    }}
  >

    {/* POPUP WINDOW */}

    <div
      onClick={(event) =>
        event.stopPropagation()
      }
      style={{
        width: "min(1200px, 95vw)",
        height: "min(850px, 92vh)",
        background: "#080d14",
        border:
          "1px solid rgba(80, 160, 255, 0.35)",
        borderRadius: "10px",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow:
          "0 20px 80px rgba(0, 0, 0, 0.6)",
      }}
    >

      {/* HEADER */}

      <div
        style={{
          height: "58px",
          minHeight: "58px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 18px",
          borderBottom:
            "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >

        <div>

          <strong
            style={{
              fontSize: "13px",
              letterSpacing: "0.08em",
            }}
          >
            AI DETECTION INSPECTION
          </strong>

          <div
            style={{
              fontSize: "9px",
              color: "#7d91a8",
              marginTop: "3px",
            }}
          >
            {aiResult?.personCount || 0} PERSONS DETECTED
          </div>

        </div>

        <button
          onClick={() =>
            setShowDetectionModal(false)
          }
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "5px",
            border:
              "1px solid rgba(255,255,255,0.12)",
            background:
              "rgba(255,255,255,0.04)",
            color: "#ffffff",
            cursor: "pointer",
            fontSize: "18px",
          }}
        >
          ×
        </button>

      </div>


      {/* ZOOM CONTROLS */}

      <div
        style={{
          minHeight: "70px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          borderBottom:
            "1px solid rgba(255,255,255,0.08)",
          padding: "10px 18px",
        }}
      >

        <button
          className="primary-button"
          onClick={() =>
            setDetectionZoom(
              Math.max(
                1,
                detectionZoom - 0.25
              )
            )
          }
        >
          −
        </button>

        <span
          style={{
            minWidth: "55px",
            textAlign: "center",
            fontSize: "11px",
          }}
        >
          {Math.round(
            detectionZoom * 100
          )}
          %
        </span>

        <button
          className="primary-button"
          onClick={() =>
            setDetectionZoom(
              Math.min(
                4,
                detectionZoom + 0.25
              )
            )
          }
        >
          +
        </button>

        <button
          className="primary-button"
          onClick={() =>
            setDetectionZoom(1)
          }
        >
          RESET
        </button>

      </div>


      {/* IMAGE */}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          background: "#03070b",
        }}
      >

        <div
          style={{
            position: "relative",
            width: "min(100%, 1100px)",
            aspectRatio:
              aiResult?.imageWidth &&
              aiResult?.imageHeight
                ? `${aiResult.imageWidth} / ${aiResult.imageHeight}`
                : "16 / 9",
            transform:
              `scale(${detectionZoom})`,
            transformOrigin: "center center",
          }}
        >

          {/* IMAGE */}

          <img
            src={imagePreview}
            alt="AI detection"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "fill",
              display: "block",
            }}
          />


          {/* DETECTION BOXES */}

          {aiResult?.detections?.map(
            (detection, index) => {

              const [
                x1,
                y1,
                x2,
                y2,
              ] = detection.bbox;

              const imageWidth =
                aiResult.imageWidth || 1;

              const imageHeight =
                aiResult.imageHeight || 1;

              const left =
                (x1 / imageWidth) * 100;

              const top =
                (y1 / imageHeight) * 100;

              const width =
                ((x2 - x1) /
                  imageWidth) *
                100;

              const height =
                ((y2 - y1) /
                  imageHeight) *
                100;

return (
  <div
    key={
      detection.id ||
      index
    }
    style={{
      position: "absolute",
      left: `${left}%`,
      top: `${top}%`,
      width: `${width}%`,
      height: `${height}%`,
      border: "1.65px solid #ff3333",
      boxSizing: "border-box",
      zIndex: 10,
      pointerEvents: "none",
    }}
  />
);
            }
          )}
        </div>

      </div>

    </div>

  </div>

)}
</main>

</div>

);

}

export default App;