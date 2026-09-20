import { useState } from "react";
import {
  MapPin,
  Radio,
  Navigation,
  Users,
  Battery,
  Wifi,
  Volume2,
  Crosshair,
  Car,
  Footprints,
  AlertTriangle,
  Route,
  Signal,
} from "lucide-react";
import "./App.css";

const teams = [
  {
    id: "TEAM-01",
    name: "RESCUE ALPHA",
    type: "ON FOOT",
    latitude: 13.0812,
    longitude: 80.2741,
    battery: 78,
    status: "AVAILABLE",
  },
  {
    id: "TEAM-02",
    name: "RESCUE BRAVO",
    type: "OLD VEHICLE",
    latitude: 13.0798,
    longitude: 80.2762,
    battery: 84,
    status: "AVAILABLE",
  },
  {
    id: "TEAM-03",
    name: "RESCUE CHARLIE",
    type: "MODERN VEHICLE",
    latitude: 13.0771,
    longitude: 80.281,
    battery: 91,
    status: "AVAILABLE",
  },
];

function App() {
  const [selectedTeam, setSelectedTeam] = useState(teams[0]);
  const [connected, setConnected] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const survivor = {
    latitude: 13.0839,
    longitude: 80.2787,
  };

  return (
    <div className="rescue-app">
      {/* TOP BAR */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <Radio size={24} />
          </div>

          <div>
            <h1>AEROCUE</h1>
            <span>RESCUE FIELD TERMINAL</span>
          </div>
        </div>

        <div className="connection">
          <span className="connection-dot"></span>
          <span>{connected ? "GCS CONNECTED" : "GCS OFFLINE"}</span>
          <Signal size={18} />
        </div>
      </header>

      {/* MAIN */}
      <main className="main-grid">
        {/* LEFT */}
        <section className="left-column">
          {/* MISSION STATUS */}
          <div className="card mission-card">
            <div className="card-header">
              <div>
                <span className="eyebrow">RESCUE MISSION</span>
                <h2>SURVIVOR LOCATED</h2>
              </div>

              <div className="priority">
                <AlertTriangle size={16} />
                PRIORITY
              </div>
            </div>

            <div className="survivor-location">
              <MapPin size={25} />
              <div>
                <span>SURVIVOR GPS</span>
                <strong>
                  {survivor.latitude.toFixed(4)}° N &nbsp;
                  {survivor.longitude.toFixed(4)}° E
                </strong>
              </div>
            </div>
          </div>

          {/* MAP */}
          <div className="card map-card">
            <div className="map-header">
              <div>
                <span className="eyebrow">NAVIGATION</span>
                <h2>ROUTE TO SURVIVOR</h2>
              </div>

              <div className="map-status">
                <Crosshair size={16} />
                GPS LOCK
              </div>
            </div>

            <div className="map">
              <div className="map-grid"></div>

              {/* Roads */}
              <div className="road road-1"></div>
              <div className="road road-2"></div>
              <div className="road road-3"></div>
              <div className="road road-4"></div>

              {/* Route */}
              <div className="route-line"></div>

              {/* Team marker */}
              <div className="map-marker team-marker">
                <Navigation size={17} />
              </div>

              {/* Survivor marker */}
              <div className="map-marker survivor-marker">
                <MapPin size={20} />
              </div>

              <div className="map-label team-label">
                {selectedTeam.id}
              </div>

              <div className="map-label survivor-label">
                SURVIVOR
              </div>

              <div className="map-coordinates">
                <span>N 13.0840</span>
                <span>E 80.2787</span>
              </div>
            </div>
          </div>

          {/* NAVIGATION */}
          <div className="card navigation-card">
            <div className="navigation-main">
              <Navigation size={32} />

              <div>
                <span>NEXT INSTRUCTION</span>
                <h2>PROCEED NORTHEAST</h2>
                <p>Continue for approximately 620 metres</p>
              </div>
            </div>

            <div className="navigation-stats">
              <div>
                <span>DISTANCE</span>
                <strong>620 m</strong>
              </div>

              <div>
                <span>BEARING</span>
                <strong>074°</strong>
              </div>

              <div>
                <span>ETA</span>
                <strong>08 min</strong>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT */}
        <aside className="right-column">
          {/* TEAM */}
          <div className="card">
            <div className="card-header">
              <div>
                <span className="eyebrow">FIELD UNIT</span>
                <h2>RESCUE TEAM</h2>
              </div>

              <Users size={21} />
            </div>

            <div className="team-selector">
              {teams.map((team) => (
                <button
                  key={team.id}
                  className={
                    selectedTeam.id === team.id
                      ? "team-option active"
                      : "team-option"
                  }
                  onClick={() => setSelectedTeam(team)}
                >
                  <div className="team-icon">
                    {team.type === "ON FOOT" ? (
                      <Footprints size={19} />
                    ) : (
                      <Car size={19} />
                    )}
                  </div>

                  <div className="team-info">
                    <strong>{team.id}</strong>
                    <span>{team.type}</span>
                  </div>

                  <div className="team-status">
                    {team.status}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* LIVE GPS */}
          <div className="card">
            <div className="card-header">
              <div>
                <span className="eyebrow">POSITION</span>
                <h2>LIVE GPS</h2>
              </div>

              <MapPin size={20} />
            </div>

            <div className="gps-box">
              <div>
                <span>LATITUDE</span>
                <strong>{selectedTeam.latitude.toFixed(6)}</strong>
              </div>

              <div>
                <span>LONGITUDE</span>
                <strong>{selectedTeam.longitude.toFixed(6)}</strong>
              </div>

              <div>
                <span>ALTITUDE</span>
                <strong>24 m</strong>
              </div>

              <div>
                <span>HEADING</span>
                <strong>074°</strong>
              </div>
            </div>
          </div>

          {/* RADIO */}
          <div className="card">
            <div className="card-header">
              <div>
                <span className="eyebrow">COMMUNICATION</span>
                <h2>RADIO LINK</h2>
              </div>

              <Radio size={20} />
            </div>

            <div className="radio-status">
              <div className="radio-indicator">
                <Wifi size={20} />
              </div>

              <div>
                <strong>LINK ACTIVE</strong>
                <span>SX1262 / RADIO CHANNEL 04</span>
              </div>
            </div>

            <div className="signal-bars">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>

          {/* BATTERY */}
          <div className="card">
            <div className="card-header">
              <div>
                <span className="eyebrow">DEVICE</span>
                <h2>STATUS</h2>
              </div>

              <Battery size={20} />
            </div>

            <div className="device-status">
              <div>
                <span>BATTERY</span>
                <strong>{selectedTeam.battery}%</strong>
              </div>

              <div className="battery-bar">
                <div
                  style={{
                    width: `${selectedTeam.battery}%`,
                  }}
                ></div>
              </div>

              <div className="device-row">
                <span>GPS</span>
                <strong>LOCKED</strong>
              </div>

              <div className="device-row">
                <span>RADIO</span>
                <strong>CONNECTED</strong>
              </div>
            </div>
          </div>

          {/* VOICE */}
          <div className="card voice-card">
            <div className="voice-header">
              <div className="voice-icon">
                <Volume2 size={22} />
              </div>

              <div>
                <span className="eyebrow">VOICE GUIDANCE</span>
                <h2>AI NAVIGATION</h2>
              </div>

              <button
                className={voiceEnabled ? "toggle active" : "toggle"}
                onClick={() => setVoiceEnabled(!voiceEnabled)}
              >
                <span></span>
              </button>
            </div>

            <div className="voice-command">
              {voiceEnabled
                ? '"Proceed northeast for approximately 620 metres."'
                : "VOICE GUIDANCE DISABLED"}
            </div>
          </div>

          {/* ACTION */}
          <button className="arrived-button">
            <Route size={20} />
            MARK ARRIVED AT SURVIVOR
          </button>
        </aside>
      </main>

      {/* FOOTER */}
      <footer>
        <span>AEROCUE RESCUE NETWORK</span>
        <span>FIELD TERMINAL • SIMULATION MODE</span>
        <span>GCS LINK: {connected ? "ONLINE" : "OFFLINE"}</span>
      </footer>
    </div>
  );
}

export default App;
