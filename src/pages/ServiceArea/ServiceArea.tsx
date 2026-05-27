import React, { useState, useMemo } from 'react';
import { 
  Search,
  Download,
  FileText,
  Printer,
  Navigation,
  Layers,
  Search as SearchIcon
} from 'lucide-react';
import { GoogleMap, useJsApiLoader, Marker, Polygon } from '@react-google-maps/api';
import { useLpo } from '../../context/LpoContext';
import { db, googleMapsApiKey } from '../../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Hardcoded coordinates for common demo suburbs to ensure pins show up
const COORDINATES_MAP: Record<string, { lat: number, lng: number }> = {
  'CASTLE HILL': { lat: -33.729, lng: 151.003 },
  'KELLYVILLE': { lat: -33.719, lng: 150.946 },
  'NORTH KELLYVILLE': { lat: -33.693, lng: 150.931 },
  'ROUSE HILL': { lat: -33.676, lng: 150.922 },
  'BEAUMONT HILLS': { lat: -33.689, lng: 150.927 },
};

const mapStyles = [
  {
    "elementType": "geometry",
    "stylers": [{ "color": "#f5f5f5" }]
  },
  {
    "elementType": "labels.icon",
    "stylers": [{ "visibility": "off" }]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#616161" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [{ "color": "#ffffff" }]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [{ "color": "#c9e2ff" }]
  }
];

const ServiceArea: React.FC = () => {
  const { parent, companyData } = useLpo();
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredSuburb, setHoveredSuburb] = useState<string | null>(null);
  
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: googleMapsApiKey
  });

  const territories = useMemo(() => {
    // If the user context has companyData (they are acting as a customer), use that. Otherwise use parent.
    let territoryJSON: any = companyData?.franchiseeTerritoryJSON || parent?.franchiseeTerritoryJSON;

    if (!territoryJSON || (Array.isArray(territoryJSON) && territoryJSON.length === 0) || territoryJSON === '[]') {
      return [];
    }
    
    let rawData: any[] = [];
    if (Array.isArray(territoryJSON)) {
      rawData = territoryJSON;
    } else if (typeof territoryJSON === 'string') {
      try {
        let parsed = JSON.parse(territoryJSON);
        if (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        if (Array.isArray(parsed)) {
          rawData = parsed;
        } else {
          // If it's an object, try wrapping it in array
          rawData = [parsed];
        }
      } catch (e) {
        console.error("JSON parse failed, trying regex fallback", e);
        // Fallback: Extract everything in quotes
        const matches = territoryJSON.match(/"([^"]+)"/g);
        if (matches) {
          rawData = matches.map(s => s.replace(/"/g, ''));
        }
      }
    }

    if (!Array.isArray(rawData) || rawData.length === 0) {
      return [];
    }

    return rawData.map(item => {
      if (typeof item === 'string') {
        const parts = item.split(',');
        const suburb = parts[0]?.trim() || '';
        const rest = parts[1]?.trim() || '';
        const restParts = rest.split(' ');
        const state = restParts[0] || '';
        const postcode = restParts[restParts.length - 1] || '';
        const date = parts[2]?.trim() || '';

        return {
          suburb,
          state,
          postcode,
          date,
          lat: COORDINATES_MAP[suburb.toUpperCase()]?.lat,
          lng: COORDINATES_MAP[suburb.toUpperCase()]?.lng,
        };
      }
      return {
        ...item,
        lat: item.lat || COORDINATES_MAP[item.suburb.toUpperCase()]?.lat,
        lng: item.lng || COORDINATES_MAP[item.suburb.toUpperCase()]?.lng,
      };
    });
  }, [parent, companyData]);

  const [geocodedTerritories, setGeocodedTerritories] = useState<any[]>([]);

  React.useEffect(() => {
    if (!isLoaded || !window.google || territories.length === 0) {
      setGeocodedTerritories(territories);
      return;
    }

    let isMounted = true;
    const geocoder = new window.google.maps.Geocoder();
    
    const geocodeMissing = async () => {
      const updated = [...territories];
      let changed = false;

      for (let i = 0; i < updated.length; i++) {
        if (!updated[i].lat || !updated[i].lng || !updated[i].boundaryPaths) {
          const address = `${updated[i].suburb}, ${updated[i].state} ${updated[i].postcode}`;
          // Create safe document ID (e.g. EASTLAKES_NSW_2018)
          const cacheDocId = address.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_');
          
          let cacheHit = false;

          try {
            // Check cache first
            const cacheRef = doc(db, 'suburb_boundaries', cacheDocId);
            const cacheDoc = await getDoc(cacheRef);
            
            if (cacheDoc.exists()) {
              const data = cacheDoc.data();
              updated[i].lat = data.lat;
              updated[i].lng = data.lng;
              updated[i].boundaryPaths = data.boundaryPaths;
              cacheHit = true;
              changed = true;
            }
          } catch (e) {
            console.error("Cache read failed", e);
          }

          if (!cacheHit) {
            // First, get Google coordinates
            if (!updated[i].lat || !updated[i].lng) {
              try {
                const results = await new Promise<google.maps.GeocoderResult[]>((resolve) => {
                  geocoder.geocode({ address }, (res, status) => {
                    if (status === 'OK' && res) resolve(res);
                    else resolve([]);
                  });
                });
                if (results && results.length > 0) {
                  updated[i].lat = results[0].geometry.location.lat();
                  updated[i].lng = results[0].geometry.location.lng();
                }
              } catch (e) {
                console.error("Geocoding failed for", address, e);
              }
            }

            // Then, get boundary from Nominatim
            if (!updated[i].boundaryPaths) {
              try {
                const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&polygon_geojson=1`);
                const nomData = await nomRes.json();
                
                if (nomData && nomData.length > 0 && nomData[0].geojson) {
                  const geojson = nomData[0].geojson;
                  let paths: any[] = [];
                  
                  if (geojson.type === 'Polygon') {
                    paths = [geojson.coordinates[0].map((coord: any) => ({ lat: parseFloat(coord[1]), lng: parseFloat(coord[0]) }))];
                  } else if (geojson.type === 'MultiPolygon') {
                    paths = geojson.coordinates.map((poly: any) => 
                      poly[0].map((coord: any) => ({ lat: parseFloat(coord[1]), lng: parseFloat(coord[0]) }))
                    );
                  }
                  
                  if (paths.length > 0) {
                    updated[i].boundaryPaths = paths;
                  }
                }
              } catch (e) {
                console.error("Boundary fetch failed for", address, e);
              }
              
              // Save to cache for future
              if (updated[i].lat && updated[i].lng && updated[i].boundaryPaths) {
                try {
                  await setDoc(doc(db, 'suburb_boundaries', cacheDocId), {
                    lat: updated[i].lat,
                    lng: updated[i].lng,
                    boundaryPaths: updated[i].boundaryPaths,
                    address
                  });
                } catch(e) {
                  console.error("Cache write failed", e);
                }
              }

              // Required 1-second delay for Nominatim Usage Policy
              await new Promise(r => setTimeout(r, 1100));
            } else {
              // Small delay for Google API rate limit if only geocoding was done
              await new Promise(r => setTimeout(r, 200));
            }
            
            changed = true;
          }
          
          // Update state incrementally so user sees boundaries appearing
          if (isMounted && changed) {
            setGeocodedTerritories([...updated]);
            changed = false;
          }
        }
      }
      
      if (isMounted && changed) {
        setGeocodedTerritories(updated);
      } else if (isMounted && !changed) {
        setGeocodedTerritories(territories);
      }
    };
    
    geocodeMissing();
    
    return () => { isMounted = false; };
  }, [territories, isLoaded]);

  const displayTerritories = geocodedTerritories.length > 0 ? geocodedTerritories : territories;

  const filteredTerritories = displayTerritories.filter(t => 
    t.suburb.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.postcode.includes(searchTerm)
  );

  const mapCenter = useMemo(() => {
    if (filteredTerritories.length > 0 && filteredTerritories[0].lat) {
      return { lat: filteredTerritories[0].lat, lng: filteredTerritories[0].lng };
    }
    return { lat: -33.71, lng: 150.97 };
  }, [filteredTerritories]);

  return (
    <div className="service-area-premium">
      {/* Mesh Background */}
      <div className="mesh-bg">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>
      
      {/* Temporary Debug output for diagnostic purposes */}
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 9999, background: 'rgba(0,0,0,0.8)', color: '#0f0', padding: 10, fontSize: '10px', borderRadius: 4, maxWidth: 350, wordBreak: 'break-all' }}>
        <p>Has Parent: {parent ? 'Yes' : 'No'}</p>
        <p>Has Company: {companyData ? 'Yes' : 'No'}</p>
        <p>Parsed Territories: {territories.length}</p>
        <p>Display Territories: {displayTerritories.length}</p>
        <p>Raw Input: {JSON.stringify(companyData?.franchiseeTerritoryJSON || parent?.franchiseeTerritoryJSON)}</p>
      </div>

      <div className="split-layout">
        {/* Left Panel: Content & List */}
        <aside className="content-side">
          <header className="side-header">
            <div className="badge">
              <Navigation size={14} /> COVERAGE MAP
            </div>
            <h1>Service Areas</h1>
            <p>Managing service availability across <strong>{displayTerritories.length}</strong> active regions within your service territory.</p>

            <div className="search-pill">
              <SearchIcon size={18} />
              <input 
                type="text" 
                placeholder="Search suburbs or postcodes..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </header>

          <div className="card-list scrollbar-hide">
            {filteredTerritories.map((t, index) => (
              <div 
                key={index} 
                className={`location-card glass ${hoveredSuburb === t.suburb ? 'highlight' : ''}`}
                onMouseEnter={() => setHoveredSuburb(t.suburb)}
                onMouseLeave={() => setHoveredSuburb(null)}
              >
                <div className="card-info">
                  <h3>{t.suburb}</h3>
                  <div className="card-meta">
                    <span className="state-tag">{t.state}</span>
                    <span className="postcode-tag">{t.postcode}</span>
                    {t.date && <span className="date-tag">{t.date}</span>}
                  </div>
                </div>
                <div className="active-badge">ACTIVE</div>
              </div>
            ))}

            {filteredTerritories.length === 0 && (
              <div className="empty-state glass">
                <Search size={32} />
                <p>No regions found matching your filter.</p>
              </div>
            )}
          </div>

          <div className="side-footer glass">
             <div className="footer-links">
               <button className="icon-btn"><Download size={18} /></button>
               <button className="icon-btn"><FileText size={18} /></button>
               <button className="icon-btn"><Printer size={18} /></button>
             </div>
             <div className="region-stat">
               <strong>{filteredTerritories.length}</strong> Results
             </div>
          </div>
        </aside>

        {/* Right Panel: Map */}
        <main className="map-side">
          {isLoaded ? (
            <div className="map-wrapper">
              <GoogleMap
                mapContainerClassName="premium-map"
                center={mapCenter}
                zoom={12.5}
                options={{
                  styles: mapStyles,
                  disableDefaultUI: true,
                  zoomControl: true,
                  gestureHandling: 'greedy'
                }}
              >
                {displayTerritories.map((t, index) => (
                  <React.Fragment key={index}>
                    {t.boundaryPaths && t.boundaryPaths.map((path: any, pIdx: number) => (
                      <Polygon
                        key={`poly-${index}-${pIdx}`}
                        paths={path}
                        options={{
                          fillColor: hoveredSuburb === t.suburb ? '#C99E5C' : '#1A3D33',
                          fillOpacity: hoveredSuburb === t.suburb ? 0.4 : 0.15,
                          strokeColor: hoveredSuburb === t.suburb ? '#C99E5C' : '#1A3D33',
                          strokeOpacity: 0.8,
                          strokeWeight: 2,
                          clickable: false
                        }}
                      />
                    ))}
                    {t.lat && t.lng && (
                      <Marker 
                        position={{ lat: t.lat, lng: t.lng }}
                        title={t.suburb}
                        opacity={hoveredSuburb && hoveredSuburb !== t.suburb ? 0.4 : 1}
                        animation={hoveredSuburb === t.suburb ? google.maps.Animation.BOUNCE : undefined}
                      />
                    )}
                  </React.Fragment>
                ))}
              </GoogleMap>
              
              <div className="map-controls glass">
                <button className="map-type-btn">
                  <Layers size={18} />
                </button>
              </div>
            </div>
          ) : (
            <div className="map-loading glass">
              <div className="spinner"></div>
              <span>Initializing Interactive Map...</span>
            </div>
          )}
        </main>
      </div>

      <style>{`
        .service-area-premium {
          position: relative;
          height: 100vh;
          width: 100%;
          overflow: hidden;
          background: var(--offwhite);
          color: var(--ink);
        }

        /* Mesh Background */
        .mesh-bg {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 0;
          filter: blur(80px);
          opacity: 0.6;
        }

        .blob {
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
        }

        .blob-1 { top: -100px; right: -100px; background: var(--cream-warm); animation: pulse 20s infinite alternate; }
        .blob-2 { bottom: -150px; left: -100px; background: var(--cream-warm); animation: pulse 25s infinite alternate-reverse; }
        .blob-3 { top: 40%; left: 30%; width: 400px; height: 400px; background: var(--gold); opacity: 0.2; }

        @keyframes pulse {
          0%, 100% { border-radius: 63% 37% 54% 46% / 55% 48% 52% 45%; }
          50% { border-radius: 40% 60% 54% 46% / 49% 60% 40% 51%; }
        }

        .split-layout {
          display: flex;
          position: relative;
          z-index: 1;
          height: 100%;
        }

        /* Side Panel */
        .content-side {
          width: 440px;
          height: 100%;
          background: rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-right: 1px solid rgba(255, 255, 255, 0.3);
          display: flex;
          flex-direction: column;
          padding: 40px 0 0 0;
          box-shadow: 20px 0 60px rgba(26, 61, 51, 0.05);
        }

        .side-header {
          padding: 0 32px 32px 32px;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--ink);
          color: white;
          padding: 6px 12px;
          border-radius: 20px;
          font-family: var(--font-ui);
          font-size: 0.6rem;
          font-weight: 500;
          letter-spacing: 0.16em;
          margin-bottom: 20px;
        }

        .side-header h1 {
          font-family: var(--font-headings);
          font-size: 2.2rem;
          font-weight: 400;
          margin-bottom: 12px;
          letter-spacing: -0.025em;
        }

        .side-header p {
          color: var(--ink-soft);
          font-size: 1rem;
          line-height: 1.5;
          margin-bottom: 32px;
        }

        .search-pill {
          display: flex;
          align-items: center;
          gap: 12px;
          background: white;
          border: 1px solid var(--cream-warm);
          padding: 12px 20px;
          border-radius: 16px;
          box-shadow: 0 4px 12px rgba(26, 61, 51, 0.03);
          transition: border-color 0.2s;
        }

        .search-pill:focus-within {
          border-color: var(--ink);
        }

        .search-pill input {
          border: none;
          background: transparent;
          font-size: 1rem;
          width: 100%;
          outline: none;
        }

        /* Card List */
        .card-list {
          flex: 1;
          overflow-y: auto;
          padding: 0 32px 32px 32px;
        }

        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

        .location-card {
          margin-bottom: 16px;
          padding: 24px;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.8) !important;
          border: 1px solid rgba(255, 255, 255, 0.5);
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
        }

        .location-card:hover {
          transform: translateX(8px);
          background: white !important;
          box-shadow: 0 10px 30px rgba(26, 61, 51, 0.08);
        }

        .location-card.highlight {
          border-color: var(--ink);
          box-shadow: 0 0 0 2px var(--ink);
          background: white !important;
        }

        .card-info h3 {
          font-family: var(--font-headings);
          font-size: 1.15rem;
          font-weight: 500;
          margin-bottom: 8px;
        }

        .card-meta {
          display: flex;
          gap: 12px;
        }

        .state-tag {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--ink-soft);
          opacity: 0.6;
        }

        .postcode-tag {
          font-family: var(--font-ui);
          font-size: 0.7rem;
          font-weight: 500;
          color: var(--ink);
          background: var(--cream-warm);
          padding: 2px 8px;
          border-radius: 6px;
          letter-spacing: 0.05em;
        }

        .date-tag {
          font-family: var(--font-ui);
          font-size: 0.7rem;
          font-weight: 500;
          color: var(--ink-soft);
          background: rgba(0,0,0,0.05);
          padding: 2px 8px;
          border-radius: 6px;
          letter-spacing: 0.05em;
        }

        .active-badge {
          font-family: var(--font-ui);
          font-size: 0.6rem;
          font-weight: 500;
          color: #2ecc71;
          letter-spacing: 0.16em;
        }

        .empty-state {
          padding: 60px 40px;
          text-align: center;
          color: var(--ink-soft);
          opacity: 0.6;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .side-footer {
          padding: 24px 32px;
          background: rgba(255, 255, 255, 0.6) !important;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .footer-links {
          display: flex;
          gap: 12px;
        }

        .icon-btn {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: white;
          border: 1px solid var(--cream-warm);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--ink);
          cursor: pointer;
          transition: all 0.2s;
        }

        .icon-btn:hover {
          background: var(--ink);
          color: white;
        }

        .region-stat {
          font-size: 0.9rem;
          color: var(--ink-soft);
        }

        /* Map Side */
        .map-side {
          flex: 1;
          height: 100%;
          position: relative;
        }

        .map-wrapper {
          width: 100%;
          height: 100%;
        }

        .premium-map {
          width: 100%;
          height: 100%;
        }

        .map-controls {
          position: absolute;
          bottom: 40px;
          right: 40px;
          padding: 8px;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .map-type-btn {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: white;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }

        .map-loading {
          width: calc(100% - 80px);
          height: calc(100% - 80px);
          margin: 40px;
          border-radius: 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 20px;
          color: var(--ink);
          font-weight: 700;
        }

        .glass {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.4);
        }

        @media screen and (max-width: 1100px) {
          .content-side { width: 380px; }
        }

        @media screen and (max-width: 900px) {
          .split-layout { flex-direction: column; overflow-y: auto; }
          .content-side { 
            width: 100%; 
            height: auto; 
            min-height: 100vh;
            border-right: none; 
            padding-bottom: 120px;
          }
          .map-side { 
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 350px;
            z-index: 100;
            box-shadow: 0 -10px 40px rgba(0,0,0,0.1);
          }
          .map-loading { margin: 20px; height: calc(100% - 40px); }
        }
      `}</style>
    </div>
  );
};

export default ServiceArea;
