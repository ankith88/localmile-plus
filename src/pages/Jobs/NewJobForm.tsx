import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowDownUp, 
  CheckCircle2,
  ChevronRight,
  Info,
  Building2,
  User,
  Phone,
  MapPin,
  ClipboardList,
  Lock,
  Rocket,
  Clock,
  Mail,
  Database,
  Sparkles
} from 'lucide-react';
import { useJsApiLoader, GoogleMap, Marker, Polyline } from '@react-google-maps/api';
import { formatDateForInput, getDefaultBookingDate } from '../../utils/scheduling';
import { useLpo } from '../../context/LpoContext';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, serverTimestamp, arrayUnion, getDoc, increment } from 'firebase/firestore';
import { db, googleMapsApiKey } from '../../firebase/config';

type ServiceType = 'site-to-lpo' | 'lpo-to-site' | 'round-trip';
type BillingOption = 'customer' | 'lpo';

interface JobData {
  customer: {
    company: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    suburb: string;
    state: string;
    postcode: string;
    instructions: string;
    netsuiteId?: string;
    coordinates?: { lat: number, lng: number };
  };
  service: ServiceType;
  serviceInternalId?: string;
  serviceRate?: string;
  billing: BillingOption;
  date: string;
  jobType: 'one-off' | 'scheduled';
  frequency: string[];
  preferredTime?: string;
}

const LIBRARIES: ("places" | "maps" | "routes" | "geometry")[] = ["places", "routes", "geometry"];

const JobMap: React.FC<{ stops: any[], onDistanceCalculated?: (distance: string) => void }> = ({ stops, onDistanceCalculated }) => {
  const [encodedPath, setEncodedPath] = useState<string | null>(null);
  const [markerPositions, setMarkerPositions] = useState<({lat: number, lng: number} | null)[]>([]);

  const stopsStr = JSON.stringify(stops);
  
  useEffect(() => {
    if (stops.length === 0) return;

    const fetchPositions = async () => {
      if (!window.google || !window.google.maps) return;
      const geocoder = new window.google.maps.Geocoder();
      
      const positions = await Promise.all(stops.map(async (stop) => {
        if (stop.lat && stop.lng && !isNaN(stop.lat) && !isNaN(stop.lng)) {
          return { lat: stop.lat, lng: stop.lng };
        }
        const address = `${stop.address || ''} ${stop.suburb || ''} ${stop.state || ''} ${stop.postcode || ''}`.trim();
        if (address) {
          try {
            const results = await new Promise<google.maps.GeocoderResult[]>((resolve) => {
              geocoder.geocode({ address }, (res, status) => {
                if (status === 'OK' && res) resolve(res);
                else resolve([]);
              });
            });
            if (results && results.length > 0) {
              const loc = results[0].geometry.location;
              return { lat: loc.lat(), lng: loc.lng() };
            }
          } catch (e) {
            console.error("Geocoding failed for", address);
          }
        }
        return null;
      }));
      
      setMarkerPositions(positions);
    };

    fetchPositions();
  }, [stopsStr]);

  const markerPosStr = JSON.stringify(markerPositions);

  useEffect(() => {
    if (stops.length < 2 || markerPositions.length < 2) return;
    
    const getPoint = (idx: number) => {
      const pos = markerPositions[idx];
      return pos ? { location: { latLng: { latitude: pos.lat, longitude: pos.lng } } } : null;
    };
    
    const origin = getPoint(0);
    const destination = getPoint(stops.length - 1);
    
    if (!origin || !destination) return;

    const intermediates = [];
    for (let i = 1; i < stops.length - 1; i++) {
      const pt = getPoint(i);
      if (pt) intermediates.push(pt);
    }

    const payload: any = {
      origin,
      destination,
      travelMode: 'DRIVE'
    };
    if (intermediates.length > 0) {
      payload.intermediates = intermediates;
    }

    fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleMapsApiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'
      },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      if (data && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        setEncodedPath(route.polyline?.encodedPolyline || null);
        if (onDistanceCalculated && route.distanceMeters) {
          onDistanceCalculated((route.distanceMeters / 1000).toFixed(1) + ' km');
        }
      } else {
         console.error("Routes API response invalid:", JSON.stringify(data));
      }
    })
    .catch(err => {
      console.error("Routes API request failed:", err);
    });
  }, [stopsStr, markerPosStr]);

  if (stops.length === 0) {
    return (
      <div className="map-placeholder" style={{ background: '#eee', borderRadius: '12px', height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
         <MapPin size={32} />
         <span style={{ marginLeft: '12px', fontWeight: 600 }}>No valid locations found</span>
      </div>
    );
  }

  // Find the first valid position for fallback center
  const validPos = markerPositions.find(p => p !== null) || { lat: -33.8688, lng: 151.2093 };

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '250px', borderRadius: '12px' }}
      center={validPos}
      zoom={11}
      options={{
        disableDefaultUI: true,
        zoomControl: true,
      }}
    >
      {markerPositions.map((pos, idx) => {
        if (pos) {
          const isPickup = stops[idx]?.type === 'pickup';
          return (
            <Marker 
              key={idx} 
              position={{ lat: pos.lat, lng: pos.lng }} 
              label={{ 
                text: (idx + 1).toString(),
                color: 'white',
                fontWeight: 'bold',
                fontSize: '12px'
              }}
              options={{
                icon: {
                  path: window.google?.maps?.SymbolPath?.CIRCLE,
                  scale: 14,
                  fillColor: isPickup ? '#E81C2E' : '#1A73E8',
                  fillOpacity: 1,
                  strokeWeight: 2,
                  strokeColor: '#FFFFFF'
                }
              }}
            />
          );
        }
        return null;
      })}
      
      {encodedPath && window.google?.maps?.geometry?.encoding && (
        <Polyline
          path={window.google.maps.geometry.encoding.decodePath(encodedPath)}
          options={{
            strokeColor: '#1A73E8',
            strokeWeight: 4,
            strokeOpacity: 0.8
          }}
        />
      )}
    </GoogleMap>
  );
};

const NewJobForm: React.FC = () => {
  const { parent, customer, userData, companyData } = useLpo();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [netsuiteMessage, setNetsuiteMessage] = useState<string | null>(null);
  const [customerStatus, setCustomerStatus] = useState<string | null>(null);
  const [isAwaitingTC, setIsAwaitingTC] = useState(false);
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [routeDistance, setRouteDistance] = useState<string | null>(null);
  
  // Processing States
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');

  // Independent Customer States
  const [independentServiceType, setIndependentServiceType] = useState<'outbound' | 'inbound'>('outbound');
  const [recipientData, setRecipientData] = useState({
    company: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    suburb: '',
    state: '',
    postcode: '',
    coordinates: null as { lat: number, lng: number } | null
  });

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: googleMapsApiKey,
    libraries: LIBRARIES
  });

  const [formData, setFormData] = useState<JobData>({
    customer: {
      company: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      address: '',
      suburb: '',
      state: '',
      postcode: '',
      instructions: '',
    },
    service: 'site-to-lpo',
    billing: 'lpo',
    date: formatDateForInput(getDefaultBookingDate()),
    jobType: 'one-off',
    frequency: [],
    preferredTime: '',
  });

  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [addressPredictions, setAddressPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [, setIsSearchingAddress] = useState(false);
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [, setAvailableServices] = useState<{id: ServiceType, internalId: string, rate: string}[]>([]);

  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);

  const hasPMPO = Boolean(companyData?.servicePMPOInternalID && companyData?.servicePMPOInternalID !== 'null');
  const hasAMPO = Boolean(companyData?.serviceAMPOInternalID && companyData?.serviceAMPOInternalID !== 'null');
  const canSwap = !companyData || (hasPMPO && hasAMPO) || (!hasPMPO && !hasAMPO);

  useEffect(() => {
    if (userData?.role === 'customer' && companyData) {
      if (hasPMPO && !hasAMPO && independentServiceType !== 'outbound') {
        setIndependentServiceType('outbound');
      } else if (hasAMPO && !hasPMPO && independentServiceType !== 'inbound') {
        setIndependentServiceType('inbound');
      }
    }
  }, [hasPMPO, hasAMPO, companyData, userData?.role, independentServiceType]);

  // Independent Customer Pre-population
  useEffect(() => {
    if (userData?.role === 'customer' && (customer || companyData)) {
      setFormData(prev => {
        const companyName = companyData?.companyName || customer?.name || prev.customer.company;
        const address = companyData?.address1 || companyData?.street || customer?.address || prev.customer.address;
        const suburb = companyData?.city || customer?.suburb || prev.customer.suburb;
        const state = companyData?.state || customer?.state || prev.customer.state;
        const postcode = companyData?.zip || customer?.postcode || prev.customer.postcode;

        return {
          ...prev,
          customer: {
            ...prev.customer,
            company: companyName,
            email: customer?.email || prev.customer.email,
            phone: customer?.mobile || prev.customer.phone,
            address: address,
            suburb: suburb,
            state: state,
            postcode: postcode,
            netsuiteId: customer?.id || userData.customer_id
          },
          billing: 'customer',
          service: independentServiceType === 'outbound' ? 'site-to-lpo' : 'lpo-to-site'
        };
      });
      setIsExistingCustomer(true);
      setCustomerStatus("Active");
    }
  }, [userData, customer, companyData, independentServiceType]);

  useEffect(() => {
    const draft = localStorage.getItem('rebook_draft');
    const editDraft = localStorage.getItem('edit_request_draft');
    
    if (draft && window.location.search.includes('rebook=true')) {
      try {
        const jobData = JSON.parse(draft);
        setFormData(prev => ({
          ...prev,
          customer: jobData.customer,
          service: jobData.service,
          billing: jobData.billing,
        }));
        localStorage.removeItem('rebook_draft');
      } catch (e) {
        console.error("Failed to parse rebook draft", e);
      }
    } else if (editDraft && window.location.search.includes('edit=true')) {
      try {
        const jobData = JSON.parse(editDraft);
        const customer = jobData.customer || {};
        if (customer.contact && !customer.firstName) {
          const parts = customer.contact.split(' ');
          customer.firstName = parts[0] || '';
          customer.lastName = parts.slice(1).join(' ') || '';
        }
        setFormData({
          customer: {
            ...customer,
            netsuiteId: jobData.customer?.netsuiteId || undefined
          },
          service: jobData.service,
          billing: jobData.billing,
          date: jobData.date,
          jobType: jobData.jobType,
          frequency: jobData.frequency || [],
          preferredTime: jobData.preferredTime || ''
        });
        setIsExistingCustomer(true);
      } catch (e) {
        console.error("Failed to parse edit draft", e);
      }
    }
  }, [parent, customer]);

  const selectCustomer = (c: any) => {
    const displayName = c.companyName || c.company_name || '';
    const parts = displayName.split(' ');
    
    // Extract service metadata
    const services: {id: ServiceType, internalId: string, rate: string}[] = [];
    
    if (c.lpoServiceAMPOInternalID && c.lpoServiceAMPOInternalID !== 'null') {
      services.push({ id: 'lpo-to-site', internalId: c.lpoServiceAMPOInternalID, rate: c.lpoServiceAMPORate || '10.00' });
    }
    
    if (c.lpoServicePMPOInternalID && c.lpoServicePMPOInternalID !== 'null') {
      services.push({ id: 'site-to-lpo', internalId: c.lpoServicePMPOInternalID, rate: c.lpoServicePMPORate || '10.00' });
    }
    
    if (c.lpoServiceAMPOPMPOInternalID && c.lpoServiceAMPOPMPOInternalID !== 'null') {
      services.push({ id: 'round-trip', internalId: c.lpoServiceAMPOPMPOInternalID, rate: c.lpoServiceAMPOPMPORate || '20.00' });
    }

    setAvailableServices(services);
    
    // Determine default service
    let defaultService = formData.service;
    let defaultId = '';
    let defaultRate = '';
    
    if (services.length > 0) {
      const match = services.find(s => s.id === formData.service);
      if (match) {
        defaultId = match.internalId;
        defaultRate = match.rate;
      } else {
        defaultService = services[0].id;
        defaultId = services[0].internalId;
        defaultRate = services[0].rate;
      }
    }

    setFormData({
      ...formData,
      customer: {
        company: displayName,
        firstName: c.first_name || parts[0] || '',
        lastName: c.last_name || (parts.length > 1 ? parts.slice(1).join(' ') : ''),
        email: c.customerEmail || c.email || '',
        phone: c.customerPhone || c.phone || '',
        address: c.address1 || c.address?.street || '',
        suburb: c.city || c.address?.suburb || '',
        state: c.state || c.address?.state || '',
        postcode: c.zip || c.address?.postcode || '',
        instructions: c.instructions || '',
        netsuiteId: c.companyId || c.customerInternalId || undefined,
        coordinates: c.coordinates || undefined
      },
      service: defaultService,
      serviceInternalId: defaultId,
      serviceRate: defaultRate
    });
    setIsExistingCustomer(true);
    setFormData(prev => ({
      ...prev,
      billing: (c.billing || prev.billing) as BillingOption,
      jobType: (c.jobtype || c.jobType || prev.jobType) as 'one-off' | 'scheduled'
    }));
    setCustomerStatus(c.status || "Active");
    setSearchResults([]);
  };

  // Handle available services for new customers (Allow all, but no internal IDs)
  useEffect(() => {
    if (!isExistingCustomer) {
      const services: {id: ServiceType, internalId: string, rate: string}[] = [
        { id: 'site-to-lpo', internalId: '', rate: '10.00' },
        { id: 'lpo-to-site', internalId: '', rate: '10.00' },
        { id: 'round-trip', internalId: '', rate: '20.00' }
      ];
      setAvailableServices(services);
    }
  }, [isExistingCustomer]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        let q;
        if (userData?.parent_id) {
          // Parent user - fetch sub-customers
          q = query(collection(db, `lpo/${userData.parent_id}/customers`));
        } else if (userData?.customer_id && userData?.role === 'customer') {
          // Independent customer - fetch from their address book
          q = query(collection(db, `companies/${userData.customer_id}/address_book`));
        } else {
          return;
        }

        const snapshot = await getDocs(q);
        const customers = snapshot.docs.map(doc => ({ ...(doc.data() as any), id: doc.id }));
        setAllCustomers(customers);

        // Handle pre-fill from URL params
        const params = new URLSearchParams(window.location.search);
        const customerId = params.get('customerId');
        if (customerId) {
          const customer = customers.find(c => c.id === customerId);
          if (customer) {
            selectCustomer(customer);
          }
        }
      } catch (error) {
        console.error("Error fetching customers/addresses for cache:", error);
      }
    };
    fetchAll();
  }, [userData, parent]);

  useEffect(() => {
    const term = (userData?.role === 'customer' ? recipientData.company : formData.customer.company).toLowerCase();
    if (term.length > 2) {
      const results = allCustomers.filter(c => {
        const name = (c.companyName || c.company_name || c.first_name || '').toLowerCase();
        const city = (c.city || c.address?.suburb || '').toLowerCase();
        const zip = (c.zip || c.address?.postcode || '').toLowerCase();
        return name.includes(term) || city.includes(term) || zip.includes(term);
      });
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [formData.customer.company, recipientData.company, allCustomers, userData?.role]);

  const selectRecipient = (c: any) => {
    const displayName = c.companyName || c.company_name || '';
    const parts = displayName.split(' ');
    
    setRecipientData({
      company: displayName,
      firstName: c.first_name || c.firstName || parts[0] || '',
      lastName: c.last_name || c.lastName || (parts.length > 1 ? parts.slice(1).join(' ') : ''),
      email: c.email || '',
      phone: c.phone || '',
      address: c.address1 || c.address?.street || c.address || '',
      suburb: c.city || c.address?.suburb || c.suburb || '',
      state: c.state || c.address?.state || c.state || '',
      postcode: c.zip || c.address?.postcode || c.postcode || '',
      coordinates: c.coordinates || null
    });
    setSearchResults([]);
  };



  const handleNext = async () => {
    if (step === 1) {
      setValidationError(null);
      
      // For independent customers, we validate both site and recipient
      if (userData?.role === 'customer') {
        if (!recipientData.address || !recipientData.suburb) {
          setValidationError(`Please select a valid ${independentServiceType === 'outbound' ? 'recipient' : 'sender'} address.`);
          return;
        }
        if (!recipientData.company) {
          setValidationError(`Please enter the ${independentServiceType === 'outbound' ? 'recipient' : 'sender'} company name.`);
          return;
        }
      } else {
        // Standard validation
        if (!formData.customer.address || !formData.customer.suburb) {
          setValidationError("Please select a valid address from the dropdown.");
          return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!formData.customer.email || !emailRegex.test(formData.customer.email)) {
          setValidationError("Please enter a valid email address.");
          return;
        }

        const phoneRegex = /^(\+?61|0)4\d{8}$|^(\+?61|0)[2378]\d{8}$/;
        const cleanPhone = formData.customer.phone.replace(/\s/g, '');
        if (!cleanPhone || !phoneRegex.test(cleanPhone)) {
          setValidationError("Please enter a valid contact phone number (AU Mobile or Landline).");
          return;
        }

        // T&C Compliance Check
        if (isExistingCustomer && customerStatus !== "Active") {
          setValidationError(`This customer (${formData.customer.company}) is still Awaiting T&C acceptance. You cannot proceed until their status is changed to Active.`);
          return;
        }
      }

      const targetAddress = userData?.role === 'customer' ? recipientData : formData.customer;
      const userSuburb = (targetAddress.suburb || '').trim().toUpperCase();
      const userState = (targetAddress.state || '').trim().toUpperCase();
      const userPostcode = (targetAddress.postcode || '').trim();
      const searchAddress = `${userSuburb}, ${userState} ${userPostcode}`;
      const fullAddressStr = `${targetAddress.address}, ${targetAddress.suburb}, ${targetAddress.state} ${targetAddress.postcode}`.trim();

      try {
        let targetCoords = targetAddress.coordinates;
        if ((!targetCoords || !targetCoords.lat || !targetCoords.lng) && window.google && window.google.maps) {
          const geocoder = new window.google.maps.Geocoder();
          const results = await new Promise<google.maps.GeocoderResult[]>((resolve) => {
            geocoder.geocode({ address: fullAddressStr }, (res, status) => {
              if (status === 'OK' && res) resolve(res);
              else resolve([]);
            });
          });
          
          if (results && results.length > 0) {
            const loc = results[0].geometry.location;
            targetCoords = { lat: loc.lat(), lng: loc.lng() };
            
            if (userData?.role === 'customer') {
              setRecipientData(prev => ({ ...prev, coordinates: targetCoords as { lat: number, lng: number } | null }));
            } else {
              setFormData(prev => ({
                ...prev,
                customer: { ...prev.customer, coordinates: targetCoords as { lat: number, lng: number } }
              }));
            }
          }
        }
      } catch (err) {
        console.error("Geocoding fallback error:", err);
      }

      try {
        const companyId = userData?.customer_id || parent?.id;
        if (companyId) {
          const compDoc = await getDoc(doc(db, 'companies', companyId));
          if (compDoc.exists()) {
            const data = compDoc.data();
            
            const territoryArray = data.franchiseeTerritoryJSON;
            const isValid = Array.isArray(territoryArray) && territoryArray.includes(searchAddress);

            if (!isValid && userSuburb !== "") {
              setValidationError(`Sorry, the address ${searchAddress} is outside our coverage.`);
              return;
            }
            
            if (data.servicePMPORate) {
              setFormData(prev => ({
                ...prev,
                serviceRate: data.servicePMPORate
              }));
            }
          }
        }
      } catch (err) {
        console.error("Verification error:", err);
      }
    }

    if (step === 2) {
      setValidationError(null);
      
      if (formData.jobType === 'scheduled' && formData.frequency.length === 0) {
        setValidationError("Please select at least one day for the scheduled service.");
        return;
      }

      const now = new Date();
      const todayStr = formatDateForInput(now);
      
      if (formData.date === todayStr && now.getHours() >= 12) {
        setValidationError("Same-day booking is no longer available (it's past 12:00 PM). Please select the next available business day.");
        return;
      }
    }
    
    changeStep(step + 1);
  };

  const changeStep = (newStep: number) => {
    setAnimating(true);
    setTimeout(() => {
      setStep(newStep);
      setAnimating(false);
    }, 300);
  };

  const handleBack = () => {
    setValidationError(null);
    changeStep(step - 1);
  };

  const fetchAddressPredictions = async (input: string) => {
    if (!input || input.length < 3 || !isLoaded) {
      setAddressPredictions([]);
      return;
    }

    if (!autocompleteServiceRef.current) {
      autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
    }

    const request: google.maps.places.AutocompletionRequest = {
      input,
      componentRestrictions: { country: 'AU' },
      types: ['address']
    };

    // Add location bias if Parent coordinates are available
    if (parent?.latitude && parent?.longitude) {
      const lat = typeof parent.latitude === 'string' ? parseFloat(parent.latitude) : parent.latitude;
      const lng = typeof parent.longitude === 'string' ? parseFloat(parent.longitude) : parent.longitude;
      
      if (!isNaN(lat) && !isNaN(lng)) {
        request.locationBias = {
          radius: 50000, // 50km
          center: { lat, lng }
        };
      }
    }

    setIsSearchingAddress(true);
    
    autocompleteServiceRef.current.getPlacePredictions(request, (predictions, status) => {
      setIsSearchingAddress(false);
      
      if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
        setAddressPredictions(predictions);
      } else {
        setAddressPredictions([]);
      }
    });
  };

  const handleAddressSelect = (prediction: google.maps.places.AutocompletePrediction) => {
    if (!isLoaded) return;

    if (!placesServiceRef.current) {
      // Need a dummy div for PlacesService if not already created
      const dummyDiv = document.createElement('div');
      placesServiceRef.current = new google.maps.places.PlacesService(dummyDiv);
    }

    placesServiceRef.current.getDetails({
      placeId: prediction.place_id,
      fields: ['address_components', 'geometry']
    }, (place, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && place) {
        let streetNumber = '';
        let route = '';
        let suburb = '';
        let state = '';
        let postcode = '';

        place.address_components?.forEach(component => {
          const types = component.types;
          if (types.includes('street_number')) streetNumber = component.long_name;
          if (types.includes('route')) route = component.long_name;
          if (types.includes('locality')) suburb = component.long_name;
          if (types.includes('administrative_area_level_1')) state = component.short_name;
          if (types.includes('postal_code')) postcode = component.long_name;
        });

        const fullStreet = `${streetNumber} ${route}`.trim();
        const location = place.geometry?.location;
        const coordinates = location ? {
          lat: location.lat(),
          lng: location.lng()
        } : undefined;

        if (userData?.role === 'customer') {
          setRecipientData(prev => ({
            ...prev,
            address: fullStreet,
            suburb: suburb,
            state: state,
            postcode: postcode,
            coordinates: coordinates || null
          }));
        } else {
          setFormData(prev => ({
            ...prev,
            customer: {
              ...prev.customer,
              address: fullStreet,
              suburb: suburb,
              state: state,
              postcode: postcode,
              coordinates
            }
          }));
        }
        setAddressPredictions([]);
      }
    });
  };


  const generateStops = (data: JobData, parentData: any) => {
    const stops: any[] = [];
    const customerLoc = {
      name: data.customer.company,
      address: data.customer.address,
      suburb: data.customer.suburb,
      state: data.customer.state,
      postcode: data.customer.postcode,
      lat: data.customer.coordinates?.lat ? parseFloat(data.customer.coordinates.lat as any) : undefined,
      lng: data.customer.coordinates?.lng ? parseFloat(data.customer.coordinates.lng as any) : undefined
    };

    const otherLoc = {
      name: recipientData.company,
      address: recipientData.address,
      suburb: recipientData.suburb,
      state: recipientData.state,
      postcode: recipientData.postcode,
      lat: recipientData.coordinates?.lat ? parseFloat(recipientData.coordinates.lat as any) : undefined,
      lng: recipientData.coordinates?.lng ? parseFloat(recipientData.coordinates.lng as any) : undefined
    };

    const rawParentLat = parentData?.latitude ?? parentData?.coordinates?.lat;
    const rawParentLng = parentData?.longitude ?? parentData?.coordinates?.lng;

    const parentLoc = {
      name: parentData?.name || '',
      address: parentData?.address1 || parentData?.address || '',
      suburb: parentData?.city || parentData?.location || parentData?.suburb || '',
      state: parentData?.state || 'NSW',
      postcode: parentData?.zip || parentData?.postcode || '',
      lat: rawParentLat ? parseFloat(rawParentLat) : undefined,
      lng: rawParentLng ? parseFloat(rawParentLng) : undefined
    };

    if (userData?.role === 'customer') {
      if (independentServiceType === 'outbound') {
        stops.push(
          { type: 'pickup', label: 'Pickup Site', locationName: customerLoc.name, address: customerLoc.address, suburb: customerLoc.suburb, state: customerLoc.state, postcode: customerLoc.postcode, lat: customerLoc.lat, lng: customerLoc.lng, sequence: 1, status: 'pending', appJobId: null },
          { type: 'delivery', label: 'Delivery Recipient', locationName: otherLoc.name, address: otherLoc.address, suburb: otherLoc.suburb, state: otherLoc.state, postcode: otherLoc.postcode, lat: otherLoc.lat, lng: otherLoc.lng, sequence: 2, status: 'pending', appJobId: null }
        );
      } else {
        stops.push(
          { type: 'pickup', label: 'Pickup Sender', locationName: otherLoc.name, address: otherLoc.address, suburb: otherLoc.suburb, state: otherLoc.state, postcode: otherLoc.postcode, lat: otherLoc.lat, lng: otherLoc.lng, sequence: 1, status: 'pending', appJobId: null },
          { type: 'delivery', label: 'Delivery Site', locationName: customerLoc.name, address: customerLoc.address, suburb: customerLoc.suburb, state: customerLoc.state, postcode: customerLoc.postcode, lat: customerLoc.lat, lng: customerLoc.lng, sequence: 2, status: 'pending', appJobId: null }
        );
      }
    } else {
      if (data.service === 'site-to-lpo') {
        stops.push(
          { type: 'pickup', label: 'Pickup Site', locationName: customerLoc.name, address: customerLoc.address, suburb: customerLoc.suburb, state: customerLoc.state, postcode: customerLoc.postcode, lat: customerLoc.lat, lng: customerLoc.lng, sequence: 1, status: 'pending', appJobId: null },
          { type: 'delivery', label: 'Delivery Parent', locationName: parentLoc.name, address: parentLoc.address, suburb: parentLoc.suburb, state: parentLoc.state, postcode: parentLoc.postcode, lat: parentLoc.lat, lng: parentLoc.lng, sequence: 2, status: 'pending', appJobId: null }
        );
      } else if (data.service === 'lpo-to-site') {
        stops.push(
          { type: 'pickup', label: 'Pickup Parent', locationName: parentLoc.name, address: parentLoc.address, suburb: parentLoc.suburb, state: parentLoc.state, postcode: parentLoc.postcode, lat: parentLoc.lat, lng: parentLoc.lng, sequence: 1, status: 'pending', appJobId: null },
          { type: 'delivery', label: 'Delivery Site', locationName: customerLoc.name, address: customerLoc.address, suburb: customerLoc.suburb, state: customerLoc.state, postcode: customerLoc.postcode, lat: customerLoc.lat, lng: customerLoc.lng, sequence: 2, status: 'pending', appJobId: null }
        );
      } else if (data.service === 'round-trip') {
        stops.push(
          { type: 'pickup', label: 'Pickup Parent', locationName: parentLoc.name, address: parentLoc.address, suburb: parentLoc.suburb, state: parentLoc.state, postcode: parentLoc.postcode, lat: parentLoc.lat, lng: parentLoc.lng, sequence: 1, status: 'pending', appJobId: null },
          { type: 'delivery', label: 'Delivery Site', locationName: customerLoc.name, address: customerLoc.address, suburb: customerLoc.suburb, state: customerLoc.state, postcode: customerLoc.postcode, lat: customerLoc.lat, lng: customerLoc.lng, sequence: 2, status: 'pending', appJobId: null },
          { type: 'pickup', label: 'Pickup Site', locationName: customerLoc.name, address: customerLoc.address, suburb: customerLoc.suburb, state: customerLoc.state, postcode: customerLoc.postcode, lat: customerLoc.lat, lng: customerLoc.lng, sequence: 3, status: 'pending', appJobId: null },
          { type: 'delivery', label: 'Delivery Parent', locationName: parentLoc.name, address: parentLoc.address, suburb: parentLoc.suburb, state: parentLoc.state, postcode: parentLoc.postcode, lat: parentLoc.lat, lng: parentLoc.lng, sequence: 4, status: 'pending', appJobId: null }
        );
      }
    }
    return stops;
  };

  const getShorthandFrequency = (days: string[]) => {
    const map: Record<string, string> = {
      'Monday': 'M',
      'Tuesday': 'T',
      'Wednesday': 'W',
      'Thursday': 'Th',
      'Friday': 'F'
    };
    return days.map(d => map[d] || d).join(',');
  };

  const handleSubmit = async () => {
    if (!parent && !customer && userData?.role !== 'customer') return;

    if (userData?.role === 'customer' && !isExistingCustomer) {
      try {
        const companyId = userData.customer_id;
        if (companyId) {
          const compDoc = await getDoc(doc(db, 'companies', companyId));
          if (compDoc.exists()) {
            const balance = compDoc.data().trial_credits_balance;
            if (typeof balance === 'number' && balance <= 0) {
              setValidationError("You have no remaining trial credits. Please upgrade your account to book more jobs.");
              return;
            }
          }
        }
      } catch (err) {
        console.error("Trial verification error:", err);
      }
    }

    setIsProcessing(true);
    setProcessingProgress(10);
    setProcessingMessage('Validating request details...');
    setValidationError(null);

    try {
      const isEditing = window.location.search.includes('edit=true');
      const requestId = new URLSearchParams(window.location.search).get('id');
      const stops = generateStops(formData, parent || customer);

      let nsResult: any = { success: true };

      // 1. NetSuite API Integration (Stage 1) - Only for NEW customers
      if (!isExistingCustomer) {
        if (userData?.role !== 'customer') {
          setProcessingProgress(25);
          setProcessingMessage('Registering new customer...');
          const NETSUITE_API = "https://1048144.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=2527&deploy=1&compid=1048144&ns-at=AAEJ7tMQJX8dMLsjS5TGMacB9-M8pUB6q50I_ptxbLYqKZ_HR3c";
          
          const params = new URLSearchParams({
            parent_id: parent?.id || "",
            company: formData.customer.company,
            firstName: formData.customer.firstName,
            lastName: formData.customer.lastName,
            email: formData.customer.email,
            phone: formData.customer.phone,
            address: formData.customer.address,
            suburb: formData.customer.suburb,
            state: formData.customer.state,
            postcode: formData.customer.postcode,
            lat: (formData.customer.coordinates?.lat || "").toString(),
            lng: (formData.customer.coordinates?.lng || "").toString(),
            service_name: formData.service || "null",
            service_internal_id: formData.serviceInternalId || "null",
            billing: formData.billing,
            jobType: formData.jobType,
            startDate: formData.date,
            frequency: getShorthandFrequency(formData.frequency),
            preferredTime: formData.preferredTime || ""
          });

          const nsResponse = await fetch(`${NETSUITE_API}&${params.toString()}`);
          nsResult = await nsResponse.json();
          
          console.log("NetSuite Script 2527 Response:", nsResult);

          if (!nsResult.success || !nsResult.isServiceable) {
            setValidationError(nsResult.message || "The address provided is not currently serviceable by our fleet. Please verify the details or contact support.");
            setIsProcessing(false);
            setStep(1); // Redirect to step 1
            return;
          }

          // Check if we need to pause for T&C
          const initialStatus = formData.billing === 'lpo' ? 'Active' : "Awaiting T&C's to be Accepted";
          setCustomerStatus(initialStatus);
        } else {
          setCustomerStatus('Active');
        }
      }

      setProcessingProgress(50);
      setProcessingMessage('Securing job request in database...');
      
      // 2. Local Firestore Job Request
      if (!parent?.id && !customer?.id && !userData?.customer_id) {
        throw new Error("Entity ID is missing. Cannot save request.");
      }
      
      // 2.1 Refetch customer status for existing customers
      let currentCustomerStatus = customerStatus;
      if (isExistingCustomer && parent?.id && userData?.role !== 'customer') {
        try {
          const custQ = query(
            collection(db, `lpo/${parent.id}/customers`), 
            where('companyName', '==', formData.customer.company)
          );
          const custSnap = await getDocs(custQ);
          if (!custSnap.empty) {
            currentCustomerStatus = custSnap.docs[0].data().status || "Active";
            setCustomerStatus(currentCustomerStatus);
          }
        } catch (e) {
          console.error("Failed to refetch customer status during submission", e);
        }
      }

      let finalRequestId = requestId;
      const isActuallyActive = userData?.role === 'customer' 
        ? true 
        : ((isExistingCustomer && currentCustomerStatus === 'Active') || (!isExistingCustomer && formData.billing === 'lpo'));
      
      const initialRequestStatus = isActuallyActive ? 'pending' : 'awaiting-activation';

      if (isEditing && requestId) {
        const cleanUpdate = JSON.parse(JSON.stringify({
          ...formData,
          stops,
          isExistingCustomer,
          netsuiteCustomerId: nsResult.customerInternalId || formData.customer.netsuiteId || null,
          appJobGroupId: null,
          syncedWithNetSuite: null,
          status: initialRequestStatus
        }));

        const sysMessage = {
          id: Date.now().toString(),
          sender: 'system',
          text: `Job request updated. New date: ${formData.date}`,
          timestamp: new Date().toISOString()
        };

        await updateDoc(doc(db, 'requests', requestId), {
          ...cleanUpdate,
          updatedAt: serverTimestamp(),
          chat: arrayUnion(sysMessage)
        });
        localStorage.removeItem('edit_request_draft');
      } else {
        const cleanData = JSON.parse(JSON.stringify({
          ...formData,
          stops,
          recipient: userData?.role === 'customer' ? recipientData : null,
          parent_id: parent?.id || userData?.parent_id || "",
          customer_id: customer?.id || userData?.customer_id || "",
          uid: userData?.uid,
          isExistingCustomer,
          netsuiteCustomerId: nsResult.customerInternalId || formData.customer.netsuiteId || null,
          status: initialRequestStatus,
          skippedDates: [],
          recurrenceStatus: 'active',
          chat: []
        }));

        const requestPayload = {
          ...cleanData,
          appJobGroupId: null,
          syncedWithNetSuite: null,
          createdAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, 'requests'), requestPayload);
        finalRequestId = docRef.id;
        setCreatedRequestId(finalRequestId);

        // If independent customer and new address, save to address book
        if (userData?.role === 'customer' && userData?.customer_id) {
          const isNewRecipient = !allCustomers.some(c => (c.companyName || c.company_name || '').toLowerCase() === recipientData.company.toLowerCase());
          if (isNewRecipient && recipientData.company) {
            try {
              await addDoc(collection(db, `companies/${userData.customer_id}/address_book`), {
                companyName: recipientData.company,
                first_name: recipientData.firstName,
                last_name: recipientData.lastName,
                email: recipientData.email,
                phone: recipientData.phone,
                address: {
                  street: recipientData.address,
                  suburb: recipientData.suburb,
                  state: recipientData.state,
                  postcode: recipientData.postcode
                },
                coordinates: recipientData.coordinates || null,
                createdAt: serverTimestamp()
              });
            } catch (e) {
              console.error("Failed to save to address book:", e);
            }
          }
        }

        // Decrement trial balance for customer job requests
        if (userData?.role === 'customer' && userData?.customer_id) {
          try {
            await updateDoc(doc(db, 'companies', userData.customer_id), {
              trial_credits_balance: increment(-1)
            });
          } catch (e) {
            console.error("Failed to decrement trial balance:", e);
          }
        }
      }

      setProcessingProgress(80);
      setProcessingMessage('Synchronising job data...');

      // 3. Second NetSuite API (Job Confirmation with Request ID)
      try {
        let confirmResponse;
        if (userData?.role === 'customer') {
          const SECOND_NETSUITE_API = "https://1048144.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=2646&deploy=1&compid=1048144&ns-at=AAEJ7tMQGy_V6q4A1r9Jg30iQSZhzKVAi6M4UjCI17mvD37SfLM";
          const customer_id = userData?.customer_id || "";
          confirmResponse = await fetch(`${SECOND_NETSUITE_API}&request_id=${finalRequestId}&customer_id=${customer_id}`);
        } else {
          const SECOND_NETSUITE_API = "https://1048144.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=2528&deploy=1&compid=1048144&ns-at=AAEJ7tMQM_E8dKF2qjDMy9ESy5q883g7xrb8uKwfgGOku62wheU";
          const customer_id = nsResult.customerInternalId || formData.customer.netsuiteId || "";
          confirmResponse = await fetch(`${SECOND_NETSUITE_API}&request_id=${finalRequestId}&parent_id=${parent?.id || ""}&customer_id=${customer_id}`);
        }
        const confirmResult = await confirmResponse.json();
        if (confirmResult.success && confirmResult.message) {
          setNetsuiteMessage(confirmResult.message);
        }
      } catch (e) {
        console.error("Secondary NetSuite sync failed", e);
      }

      setProcessingProgress(100);
      setProcessingMessage('Finalising booking...');
      await wait(800);

      // Now update the UI state based on the calculated status
      if (initialRequestStatus !== 'pending') {
        setIsAwaitingTC(true);
      } else {
        setSuccess(true);
      }
    } catch (error) {
      console.error("Error saving job request:", error);
      setValidationError("A technical error occurred during submission. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const checkManualStatus = async () => {
    if (!parent || !formData.customer.company) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, `lpo/${parent.id}/customers`), 
        where('companyName', '==', formData.customer.company)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const c = snap.docs[0].data();
        setCustomerStatus(c.status || "Active");
        if (c.status === "Active") {
          setIsAwaitingTC(false);
          // If we already created a request, update its status in the database.
          if (createdRequestId) {
            await updateDoc(doc(db, 'requests', createdRequestId), {
              status: 'pending',
              activatedAt: serverTimestamp(),
              activationReason: "Manual verification"
            });
            setSuccess(true);
          } else {
            handleSubmit();
          }
        }
      }
    } catch (e) {
      console.error("Failed to check status", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="new-job-premium">
      <div className="mesh-bg">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      <div className="form-container">
        {isProcessing ? (
          <div className="success-view-premium fade-in">
            <div className="success-card glass processing-card">
              <div className="processing-icon-area">
                <div className="processing-spinner">
                   <div className="spinner-ring"></div>
                   <Rocket size={32} className="rocket-icon" />
                </div>
              </div>
              <div className="success-text">
                <h2>Booking your Job</h2>
                <p>We're processing your request and updating our dispatch system. <strong>This can take a moment.</strong></p>
              </div>

              <div className="progress-container-premium">
                <div className="progress-label-row">
                  <span className="current-status">{processingMessage}</span>
                  <span className="percentage">{processingProgress}%</span>
                </div>
                <div className="progress-bar-bg">
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${processingProgress}%` }}
                  ></div>
                </div>
                <div className="steps-indicator">
                   <div className={`step-dot ${processingProgress >= 25 ? 'done' : 'active'}`}></div>
                   <div className={`step-dot ${processingProgress >= 50 ? 'done' : processingProgress >= 25 ? 'active' : ''}`}></div>
                   <div className={`step-dot ${processingProgress >= 80 ? 'done' : processingProgress >= 50 ? 'active' : ''}`}></div>
                   <div className={`step-dot ${processingProgress >= 100 ? 'done' : processingProgress >= 80 ? 'active' : ''}`}></div>
                </div>
              </div>
            </div>
          </div>
        ) : success ? (
          <div className="success-view-premium fade-in">
            <div className="success-card glass">
              <div className="success-icon-animation">
                <CheckCircle2 size={80} strokeWidth={2.5} className="pulse-icon" />
              </div>
              <div className="success-text">
                <h2>Request Sent!</h2>
                {netsuiteMessage ? (
                  <p>{netsuiteMessage}</p>
                ) : (
                  <p>The job request for <strong>{formData.customer.company}</strong> has been sent to the operator for review.</p>
                )}
                <p className="sub-hint">You can track the progress and coordinate with the operator via the chat links in your Job Manager.</p>
              </div>
              <div className="success-actions-premium">
                <button onClick={() => window.location.href = '/dashboard'} className="btn-primary flex-1 shadow-teal">
                   VIEW PENDING REQUESTS
                </button>
                <button onClick={() => window.location.reload()} className="btn-secondary full-width">
                   REQUEST ANOTHER JOB
                </button>
              </div>
            </div>
          </div>
        ) : isAwaitingTC ? (
          <div className="success-view-premium fade-in">
            <div className="success-card glass tc-waiting">
              <div className="success-icon-animation">
                <Clock size={80} strokeWidth={2.5} className="pulse-icon warning" />
              </div>
              <div className="success-text">
                <h2>T&C Acceptance Pending</h2>
                <p>The customer <strong>{formData.customer.company}</strong> has been created, but they must accept the Terms & Conditions before you can request a job.</p>
                <p className="sub-hint">As soon as the status changes to "Active" in NetSuite, you can proceed with the request.</p>
              </div>
              
              <div className="status-progress">
                <div className="progress-label">CURRENT STATUS</div>
                <div className="status-pill warning">AWAITING T&C</div>
              </div>

              <div className="success-actions-premium">
                <button 
                  onClick={checkManualStatus} 
                  className="btn-primary flex-1 shadow-teal"
                  disabled={loading}
                >
                   {loading ? 'CHECKING...' : 'REFRESH STATUS'}
                </button>
                <button onClick={() => window.location.reload()} className="btn-secondary">
                   CANCEL
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <header className="form-header">
              <div className="header-icon-pill">
                <Rocket size={20} />
              </div>
              <h1>Book a Job</h1>
              <p>Create a service job for your customers in seconds.</p>
            </header>

            <div className="step-tracker">
              {[1, 2].map((s) => (
                <div key={s} className={`step-item ${step === s ? 'active' : step > s ? 'completed' : ''}`}>
                  <div className="step-circle">{step > s ? <CheckCircle2 size={16} /> : s}</div>
                  <span className="step-label">{s === 1 ? 'Route & Address' : 'Map & Quote'}</span>
                  {s < 2 && <div className="step-connector"></div>}
                </div>
              ))}
            </div>

            <div className={`step-container ${animating ? 'fade-out' : 'fade-in'}`}>
              {step === 1 && (
                <div className="glass-card step-card">
                  <div className="card-top-info">
                    <Building2 size={20} />
                    <h3>{userData?.role === 'customer' ? 'Job Route' : 'Site Information'}</h3>
                  </div>

                  {userData?.role === 'customer' ? (
                    <div className="independent-step-1 fade-in">
                      <div className="unified-route-card">
                        {/* FROM SECTION */}
                        <div className={`route-segment ${independentServiceType === 'outbound' ? 'locked-segment dark-theme' : 'active-segment elevated'}`}>
                          {independentServiceType === 'outbound' ? (
                            <>
                              <div className="bg-glow"></div>
                              <div className="locked-header-row">
                                <div className="route-title">
                                  <MapPin size={18} />
                                  <span>FROM (ORIGIN)</span>
                                </div>
                                <div className="hub-badge">PRIMARY HUB</div>
                              </div>
                              <div className="locked-address-display">
                                <strong>{formData.customer.company}</strong>
                                <p>{formData.customer.address}</p>
                                <div className="address-bottom">
                                  <span>{formData.customer.suburb} {formData.customer.state} {formData.customer.postcode}</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <label className="route-label">PICKUP FROM</label>
                              <div className="address-header">
                                <MapPin size={16} />
                                <span>Sender Address</span>
                              </div>
                              <div className="searchable-address-area has-suggestions">
                                <input 
                                  type="text" 
                                  placeholder="Sender Company Name"
                                  className="transparent-input company"
                                  value={recipientData.company}
                                  onChange={(e) => setRecipientData({...recipientData, company: e.target.value})}
                                />
                                {searchResults.length > 0 && (
                                  <div className="search-dropdown glass floating-dropdown">
                                    <div className="dropdown-header">
                                      <Database size={12} />
                                      <span>MATCHED FROM ADDRESS BOOK</span>
                                    </div>
                                    {searchResults.map(c => (
                                      <div key={c.id} className="search-item-premium" onClick={() => selectRecipient(c)}>
                                        <div className="item-info">
                                          <div className="company-name">{c.companyName || c.company_name}</div>
                                          <div className="sub">{(c.city || c.address?.suburb)}, {(c.zip || c.address?.postcode)}</div>
                                        </div>
                                        <div className="item-action">
                                          <span>SELECT</span>
                                          <ChevronRight size={14} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div style={{ display: 'flex', gap: '8px', padding: '0 12px', marginTop: '8px' }}>
                                  <input type="text" placeholder="First Name" className="transparent-input" style={{ flex: 1 }} value={recipientData.firstName} onChange={(e) => setRecipientData({...recipientData, firstName: e.target.value})} />
                                  <input type="text" placeholder="Last Name" className="transparent-input" style={{ flex: 1 }} value={recipientData.lastName} onChange={(e) => setRecipientData({...recipientData, lastName: e.target.value})} />
                                </div>
                                <div style={{ display: 'flex', gap: '8px', padding: '0 12px', marginTop: '8px' }}>
                                  <input type="email" placeholder="Email" className="transparent-input" style={{ flex: 1 }} value={recipientData.email} onChange={(e) => setRecipientData({...recipientData, email: e.target.value})} />
                                  <input type="tel" placeholder="Phone" className="transparent-input" style={{ flex: 1 }} value={recipientData.phone} onChange={(e) => setRecipientData({...recipientData, phone: e.target.value})} />
                                </div>
                                <div className="search-input-wrapper" style={{ marginTop: '8px' }}>
                                  <input 
                                    type="text" 
                                    placeholder="Search Sender Address..."
                                    className="transparent-input address"
                                    value={recipientData.address}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setRecipientData(prev => ({ ...prev, address: val }));
                                      fetchAddressPredictions(val);
                                    }}
                                  />
                                </div>
                                <div style={{ display: 'flex', gap: '8px', padding: '0 12px', marginTop: '8px', opacity: 0.8 }}>
                                  <div style={{ flex: 2, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--cream-warm)', padding: '4px 0' }}>
                                    <input type="text" placeholder="Suburb" className="transparent-input no-icon" style={{ flex: 1, fontSize: '0.85rem' }} value={recipientData.suburb || ''} readOnly />
                                    <Lock size={12} style={{ opacity: 0.5 }} />
                                  </div>
                                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--cream-warm)', padding: '4px 0' }}>
                                    <input type="text" placeholder="State" className="transparent-input no-icon" style={{ flex: 1, fontSize: '0.85rem' }} value={recipientData.state || ''} readOnly />
                                    <Lock size={12} style={{ opacity: 0.5 }} />
                                  </div>
                                  <div style={{ flex: 1.2, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--cream-warm)', padding: '4px 0' }}>
                                    <input type="text" placeholder="Postcode" className="transparent-input no-icon" style={{ flex: 1, fontSize: '0.85rem' }} value={recipientData.postcode || ''} readOnly />
                                    <Lock size={12} style={{ opacity: 0.5 }} />
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        {/* SWAP BUTTON */}
                        <div className="swap-button-container">
                          {canSwap && (
                            <button 
                              className="swap-route-btn shadow-teal"
                              onClick={() => {
                                if (independentServiceType === 'outbound') {
                                  setIndependentServiceType('inbound');
                                  setFormData(prev => ({ ...prev, service: 'lpo-to-site' }));
                                } else {
                                  setIndependentServiceType('outbound');
                                  setFormData(prev => ({ ...prev, service: 'site-to-lpo' }));
                                }
                              }}
                            >
                              <ArrowDownUp size={20} />
                            </button>
                          )}
                        </div>

                        {/* TO SECTION */}
                        <div className={`route-segment ${independentServiceType === 'inbound' ? 'locked-segment dark-theme' : 'active-segment elevated'}`}>
                          {independentServiceType === 'inbound' ? (
                            <>
                              <div className="bg-glow"></div>
                              <div className="locked-header-row">
                                <div className="route-title">
                                  <MapPin size={18} />
                                  <span>TO (DESTINATION)</span>
                                </div>
                                <div className="hub-badge">PRIMARY HUB</div>
                              </div>
                              <div className="locked-address-display">
                                <strong>{formData.customer.company}</strong>
                                <p>{formData.customer.address}</p>
                                <div className="address-bottom">
                                  <span>{formData.customer.suburb} {formData.customer.state} {formData.customer.postcode}</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <label className="route-label">DELIVER TO</label>
                              <div className="address-header">
                                <MapPin size={16} />
                                <span>Recipient Address</span>
                              </div>
                              <div className="searchable-address-area has-suggestions">
                                <input 
                                  type="text" 
                                  placeholder="Recipient Company Name"
                                  className="transparent-input company"
                                  value={recipientData.company}
                                  onChange={(e) => setRecipientData({...recipientData, company: e.target.value})}
                                />
                                {searchResults.length > 0 && (
                                  <div className="search-dropdown glass floating-dropdown">
                                    <div className="dropdown-header">
                                      <Database size={12} />
                                      <span>MATCHED FROM ADDRESS BOOK</span>
                                    </div>
                                    {searchResults.map(c => (
                                      <div key={c.id} className="search-item-premium" onClick={() => selectRecipient(c)}>
                                        <div className="item-info">
                                          <div className="company-name">{c.companyName || c.company_name}</div>
                                          <div className="sub">{(c.city || c.address?.suburb)}, {(c.zip || c.address?.postcode)}</div>
                                        </div>
                                        <div className="item-action">
                                          <span>SELECT</span>
                                          <ChevronRight size={14} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div style={{ display: 'flex', gap: '8px', padding: '0 12px', marginTop: '8px' }}>
                                  <input type="text" placeholder="First Name" className="transparent-input" style={{ flex: 1 }} value={recipientData.firstName} onChange={(e) => setRecipientData({...recipientData, firstName: e.target.value})} />
                                  <input type="text" placeholder="Last Name" className="transparent-input" style={{ flex: 1 }} value={recipientData.lastName} onChange={(e) => setRecipientData({...recipientData, lastName: e.target.value})} />
                                </div>
                                <div style={{ display: 'flex', gap: '8px', padding: '0 12px', marginTop: '8px' }}>
                                  <input type="email" placeholder="Email" className="transparent-input" style={{ flex: 1 }} value={recipientData.email} onChange={(e) => setRecipientData({...recipientData, email: e.target.value})} />
                                  <input type="tel" placeholder="Phone" className="transparent-input" style={{ flex: 1 }} value={recipientData.phone} onChange={(e) => setRecipientData({...recipientData, phone: e.target.value})} />
                                </div>
                                <div className="search-input-wrapper" style={{ marginTop: '8px' }}>
                                  <input 
                                    type="text" 
                                    placeholder="Search Recipient Address..."
                                    className="transparent-input address"
                                    value={recipientData.address}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setRecipientData(prev => ({ ...prev, address: val }));
                                      fetchAddressPredictions(val);
                                    }}
                                  />
                                </div>
                                <div style={{ display: 'flex', gap: '8px', padding: '0 12px', marginTop: '8px', opacity: 0.8 }}>
                                  <div style={{ flex: 2, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--cream-warm)', padding: '4px 0' }}>
                                    <input type="text" placeholder="Suburb" className="transparent-input no-icon" style={{ flex: 1, fontSize: '0.85rem' }} value={recipientData.suburb || ''} readOnly />
                                    <Lock size={12} style={{ opacity: 0.5 }} />
                                  </div>
                                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--cream-warm)', padding: '4px 0' }}>
                                    <input type="text" placeholder="State" className="transparent-input no-icon" style={{ flex: 1, fontSize: '0.85rem' }} value={recipientData.state || ''} readOnly />
                                    <Lock size={12} style={{ opacity: 0.5 }} />
                                  </div>
                                  <div style={{ flex: 1.2, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--cream-warm)', padding: '4px 0' }}>
                                    <input type="text" placeholder="Postcode" className="transparent-input no-icon" style={{ flex: 1, fontSize: '0.85rem' }} value={recipientData.postcode || ''} readOnly />
                                    <Lock size={12} style={{ opacity: 0.5 }} />
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>


                      {addressPredictions.length > 0 && (
                        <div className="search-dropdown glass floating-dropdown address-suggestions inline-suggestions">
                          <div className="dropdown-header">
                            <MapPin size={12} />
                            <span>ADDRESS SUGGESTIONS</span>
                          </div>
                          {addressPredictions.map(p => (
                            <div key={p.place_id} className="search-item-premium address-item" onClick={() => handleAddressSelect(p)}>
                              <div className="item-info">
                                <div className="main-text">{p.structured_formatting.main_text}</div>
                                <div className="secondary-text">{p.structured_formatting.secondary_text}</div>
                              </div>
                              <div className="item-action">
                                <span>SELECT</span>
                                <ChevronRight size={14} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="input-grid">
                      <div className="input-pill full has-suggestions">
                        <Building2 size={18} />
                        <input 
                          type="text" 
                          placeholder="Company Name" 
                          value={formData.customer.company}
                          onChange={(e) => {
                            setFormData({...formData, customer: {...formData.customer, company: e.target.value}});
                            setIsExistingCustomer(false);
                          }}
                        />
                        {searchResults.length > 0 && (
                          <div className="match-badge">
                            <Sparkles size={14} className="sparkle-icon" />
                            <span>SAVED</span>
                          </div>
                        )}
                        {searchResults.length > 0 && (
                          <div className="search-dropdown glass floating-dropdown">
                            <div className="dropdown-header">
                              <Database size={12} />
                              <span>MATCHED FROM ADDRESS BOOK</span>
                            </div>
                            {searchResults.map(c => (
                              <div key={c.id} className="search-item-premium" onClick={() => selectCustomer(c)}>
                                <div className="item-info">
                                  <div className="company-name">{c.companyName || c.company_name}</div>
                                  <div className="sub">{(c.city || c.address?.suburb)}, {(c.zip || c.address?.postcode)}</div>
                                </div>
                                <div className="item-action">
                                  <span>SELECT CLIENT</span>
                                  <ChevronRight size={14} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="input-pill half">
                        <User size={18} />
                        <input 
                          type="text" 
                          placeholder="First Name"
                          value={formData.customer.firstName}
                          onChange={(e) => setFormData({...formData, customer: {...formData.customer, firstName: e.target.value}})}
                        />
                      </div>
                      <div className="input-pill half">
                        <User size={18} />
                        <input 
                          type="text" 
                          placeholder="Last Name"
                          value={formData.customer.lastName}
                          onChange={(e) => setFormData({...formData, customer: {...formData.customer, lastName: e.target.value}})}
                        />
                      </div>
                      <div className="input-pill">
                        <Mail size={18} />
                        <input 
                          type="email" 
                          placeholder="Email Address"
                          value={formData.customer.email}
                          onChange={(e) => setFormData({...formData, customer: {...formData.customer, email: e.target.value}})}
                        />
                      </div>
                      <div className="input-pill">
                        <Phone size={18} />
                        <input 
                          type="tel" 
                          placeholder="Phone Number"
                          value={formData.customer.phone}
                          onChange={(e) => setFormData({...formData, customer: {...formData.customer, phone: e.target.value}})}
                        />
                      </div>

                      <div className="input-pill full has-suggestions">
                        <MapPin size={18} />
                        <input 
                          type="text" 
                          placeholder="Start typing address..."
                          value={formData.customer.address}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormData(prev => ({
                              ...prev,
                              customer: { ...prev.customer, address: val }
                            }));
                            fetchAddressPredictions(val);
                          }}
                        />
                        {addressPredictions.length > 0 && (
                          <div className="search-dropdown glass floating-dropdown address-suggestions">
                            <div className="dropdown-header">
                              <MapPin size={12} />
                              <span>ADDRESS SUGGESTIONS</span>
                            </div>
                            {addressPredictions.map(p => (
                              <div key={p.place_id} className="search-item-premium address-item" onClick={() => handleAddressSelect(p)}>
                                <div className="item-info">
                                  <div className="main-text">{p.structured_formatting.main_text}</div>
                                  <div className="secondary-text">{p.structured_formatting.secondary_text}</div>
                                </div>
                                <div className="item-action">
                                  <span>SELECT</span>
                                  <ChevronRight size={14} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="input-pill read-only">
                        <input 
                          type="text" 
                          placeholder="Suburb"
                          className="no-icon"
                          value={formData.customer.suburb}
                          readOnly
                        />
                        <Lock size={14} className="lock-icon" />
                      </div>
                      <div className="input-pill half read-only">
                        <input 
                          type="text" 
                          placeholder="State"
                          className="no-icon"
                          value={formData.customer.state}
                          readOnly
                        />
                        <Lock size={14} className="lock-icon" />
                      </div>
                      <div className="input-pill half read-only">
                        <input 
                          type="text" 
                          placeholder="Postcode"
                          className="no-icon"
                          value={formData.customer.postcode}
                          readOnly
                        />
                        <Lock size={14} className="lock-icon" />
                      </div>
                      <div className="input-pill full">
                        <ClipboardList size={18} />
                        <textarea 
                          placeholder="Special Pickup/Delivery Instructions (Optional)"
                          value={formData.customer.instructions}
                          onChange={(e) => setFormData({...formData, customer: {...formData.customer, instructions: e.target.value}})}
                        />
                      </div>
                    </div>
                  )}

                  {validationError && (
                    <div className="error-pill glass">
                      <Info size={16} />
                      {validationError}
                    </div>
                  )}

                  <button className="btn-primary w-full shadow-teal" onClick={handleNext}>
                    VERIFY ADDRESS <ChevronRight size={18} />
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="glass-card step-card confirmation">
                  <div className="card-top-info">
                    <ClipboardList size={20} />
                    <h3>Map & Quote Confirmation</h3>
                  </div>

                  <div className="split-view">
                    <div className="map-element">
                      {isLoaded ? (
                        <JobMap 
                          stops={generateStops(formData, parent || customer)} 
                          onDistanceCalculated={(dist) => setRouteDistance(dist)}
                        />
                      ) : (
                        <div className="map-placeholder" style={{ background: '#eee', borderRadius: '12px', height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                           <span style={{ fontWeight: 600 }}>Loading Map...</span>
                        </div>
                      )}
                    </div>
                    <div className="pricing-element" style={{ marginTop: '24px' }}>
                      <div className="voucher-card glass">
                        <div className="voucher-header">
                           <div className="v-logo">mailplus</div>
                           <div className="v-badge">JOB QUOTE</div>
                        </div>
                        <div className="voucher-body">
                          <div className="v-row">
                            <span className="v-label">CUSTOMER</span>
                            <span className="v-val">{formData.customer.company}</span>
                          </div>
                          <div className="v-row">
                            <span className="v-label">TYPE</span>
                            <span className="v-val">{formData.jobType.replace(/-/g, ' ').toUpperCase()}</span>
                          </div>
                          {formData.jobType === 'scheduled' && (
                            <div className="v-row">
                              <span className="v-label">FREQUENCY</span>
                              <span className="v-val">{formData.frequency.join(', ')}</span>
                            </div>
                          )}
                          <div className="v-row">
                            <span className="v-label">SERVICE</span>
                            <span className="v-val">{formData.service.replace(/-/g, ' ').toUpperCase()}</span>
                          </div>
                          {routeDistance && (
                            <div className="v-row">
                              <span className="v-label">EST. DISTANCE</span>
                              <span className="v-val">{routeDistance}</span>
                            </div>
                          )}
                          <div className="v-row">
                            <span className="v-label">{formData.jobType === 'scheduled' ? 'START DATE' : 'SCHEDULED'}</span>
                            <span className="v-val">{formData.date}</span>
                          </div>
                          {formData.preferredTime && (
                            <div className="v-row">
                              <span className="v-label">BY TIME</span>
                              <span className="v-val">{formData.preferredTime}</span>
                            </div>
                          )}
                          <div className="v-row total">
                            <span className="v-label">FINAL QUOTE PRICE</span>
                            <span className="v-val">{formData.serviceRate ? `$${parseFloat(formData.serviceRate).toFixed(2)}` : (formData.service === 'round-trip' ? '$20.00' : '$10.00')}</span>
                          </div>
                        </div>
                        <div className="voucher-footer">
                           Valid for lodgement at {parent?.name || 'Local Parent'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="form-actions" style={{ marginTop: '32px' }}>
                    <button className="btn-text" onClick={handleBack}>Modify Selection</button>
                    <button 
                      className="btn-primary flex-1 shadow-teal" 
                      onClick={handleSubmit}
                      disabled={loading}
                    >
                      {loading ? 'PROCESSING...' : 'REQUEST JOB'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        .new-job-premium {
          position: relative;
          min-height: 100vh;
          overflow-x: hidden;
          background: var(--offwhite);
          padding-bottom: 60px;
        }

        .mesh-bg {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          z-index: 0; filter: blur(100px); opacity: 0.6;
        }
        .blob {
          position: absolute; width: 600px; height: 600px; border-radius: 50%;
          background: var(--cream-warm); animation: blobPulse 20s infinite alternate;
        }
        .blob-1 { top: -100px; right: -100px; }
        .blob-2 { bottom: -150px; left: -100px; background: var(--cream-warm); }
        .blob-3 { top: 30%; left: 30%; width: 300px; height: 300px; background: var(--gold); opacity: 0.2; }

        @keyframes blobPulse {
          0%, 100% { border-radius: 63% 37% 54% 46% / 55% 48% 52% 45%; }
          50% { border-radius: 40% 60% 54% 46% / 49% 60% 40% 51%; }
        }

        .form-container { position: relative; z-index: 1; max-width: 800px; margin: 0 auto; padding: 60px 24px; }
        .form-header { text-align: center; margin-bottom: 48px; }
        .header-icon-pill { width: 48px; height: 48px; background: white; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--ink); box-shadow: 0 8px 24px rgba(26,61,51,0.05); }
        .form-header h1 { font-family: var(--font-headings); font-size: 2.8rem; font-weight: 400; color: var(--ink); letter-spacing: -0.025em; margin-bottom: 8px; }
        .form-header p { font-size: 1.1rem; color: var(--ink-soft); font-weight: 400; }

        .step-tracker { display: flex; justify-content: space-between; max-width: 500px; margin: 0 auto 60px; position: relative; }
        .step-item { display: flex; flex-direction: column; align-items: center; gap: 12px; position: relative; z-index: 2; flex: 1; }
        .step-circle { width: 40px; height: 40px; border-radius: 50%; background: var(--cream-warm); color: var(--ink-soft); display: flex; align-items: center; justify-content: center; font-weight: 500; transition: all 0.3s; border: 2px solid white; font-family: var(--font-ui); }
        .step-item.active .step-circle { background: var(--ink); color: white; transform: scale(1.1); box-shadow: 0 8px 20px rgba(26, 61, 51, 0.2); }
        .step-item.completed .step-circle { background: var(--ink); color: white; }
        .step-label { font-family: var(--font-ui); font-size: 0.6rem; font-weight: 500; text-transform: uppercase; color: var(--ink-soft); letter-spacing: 0.16em; }
        .step-item.active .step-label { color: var(--ink); }
        .step-connector { position: absolute; top: 20px; left: calc(50% + 20px); width: calc(100% - 40px); height: 2px; background: var(--cream-warm); z-index: 1; }
        .step-item.completed .step-connector { background: var(--ink); }

        .glass-card { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 32px; padding: 40px; box-shadow: 0 20px 60px rgba(26, 61, 51, 0.05); }
        .card-top-info { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; color: var(--ink); }
        .card-top-info h3 { font-family: var(--font-headings); font-weight: 500; font-size: 1.25rem; margin: 0; }

        .search-dropdown { position: absolute; top: calc(100% + 8px); left: 0; right: 0; max-height: 280px; overflow-y: auto; background: white; border-radius: 20px; padding: 12px; z-index: 1000; box-shadow: 0 20px 50px rgba(26,61,51,0.15); border: 1px solid rgba(26,61,51,0.08); animation: dropdownSlide 0.3s cubic-bezier(0.19, 1, 0.22, 1) forwards; }
        @keyframes dropdownSlide { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        
        .dropdown-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 0.65rem; font-weight: 800; color: var(--ink); opacity: 0.6; letter-spacing: 1px; border-bottom: 1px solid var(--cream-warm); margin-bottom: 8px; }
        
        .search-item-premium { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 14px; cursor: pointer; transition: all 0.2s; margin-bottom: 4px; border: 1px solid transparent; }
        .search-item-premium:hover { background: var(--paper); border-color: var(--cream-warm); transform: translateX(4px); }
        .company-name { font-weight: 800; color: var(--ink); font-size: 1rem; }
        .search-item-premium .sub { font-size: 0.75rem; color: var(--ink-soft); opacity: 0.6; margin-top: 2px; }
        
        .item-action { display: flex; align-items: center; gap: 6px; font-size: 0.7rem; font-weight: 800; color: var(--ink); opacity: 0; transition: opacity 0.2s; }
        .search-item-premium:hover .item-action { opacity: 1; }
        
        .address-item { padding: 10px 16px; }
        .address-item .main-text { font-weight: 700; color: var(--ink); font-size: 0.95rem; }
        .address-item .secondary-text { font-size: 0.75rem; color: var(--ink-soft); opacity: 0.6; margin-top: 2px; }

        .input-pill.has-suggestions { position: relative; }
        .match-badge { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: var(--ink); color: white; padding: 4px 10px; border-radius: 8px; font-size: 0.55rem; font-weight: 900; display: flex; align-items: center; gap: 4px; animation: badgePop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; box-shadow: 0 4px 12px rgba(26, 61, 51, 0.1); }
        @keyframes badgePop { from { transform: translateY(-50%) scale(0.5); opacity: 0; } to { transform: translateY(-50%) scale(1); opacity: 1; } }
        .sparkle-icon { animation: sparkleSpin 2s infinite linear; }
        @keyframes sparkleSpin { 0% { transform: rotate(0); } 50% { transform: scale(1.2); } 100% { transform: rotate(360deg); } }

        .input-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .input-pill { display: flex; align-items: center; gap: 12px; background: white; border-radius: 18px; padding: 12px 20px; border: 1px solid var(--cream-warm); transition: border-color 0.2s; }
        .input-pill:focus-within { border-color: var(--ink); }
        
        .locked-badge { display: inline-flex; align-items: center; gap: 8px; background: var(--cream-warm); color: var(--ink); padding: 8px 16px; border-radius: 12px; font-size: 0.65rem; font-weight: 800; margin-bottom: 24px; border: 1px solid rgba(26, 61, 51, 0.05); }
        .locked-group { pointer-events: none; margin-top: 8px; }
        .field-hint.mini { font-size: 0.7rem; margin-top: 8px; }
        .input-pill.full { grid-column: span 2; }
        .input-pill input, .input-pill textarea { border: none; background: transparent; width: 100%; font-size: 0.95rem; color: var(--ink); font-weight: 500; }
        .input-pill.area textarea { resize: none; margin-top: 8px; }
        .input-pill.read-only { background: var(--paper); }
        .lock-icon { color: var(--ink-soft); }

        .toggle-section { margin-bottom: 32px; }
        .toggle-pill { display: inline-flex; align-items: center; gap: 12px; background: white; padding: 10px 20px; border-radius: 14px; font-weight: 700; color: var(--ink-soft); cursor: pointer; border: 1px solid var(--cream-warm); }

        .error-pill { display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-radius: 16px; background: #fff5f5 !important; color: #c53030; font-weight: 700; font-size: 0.9rem; margin-bottom: 24px; }

        .selection-group { margin-bottom: 40px; }
        .group-label { display: block; font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; text-transform: uppercase; color: var(--ink-soft); letter-spacing: 0.16em; margin-bottom: 16px; }
        .billing-grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; max-width: 500px; margin: 0 auto; }
        .billing-btn { padding: 16px; border-radius: 20px; font-weight: 700; color: var(--ink-soft); display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s; border: 1px solid var(--cream-warm); background: white; }
        .billing-btn.active { background: var(--ink); color: white; transform: translateY(-4px); box-shadow: 0 10px 25px rgba(26, 61, 51, 0.2); }

        .service-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .service-btn { padding: 24px; border-radius: 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--ink-soft); cursor: pointer; transition: all 0.3s; border: 1px solid var(--cream-warm); background: white; }
        .service-btn.active { background: white; color: var(--ink); transform: translateY(-6px); box-shadow: 0 20px 40px rgba(26, 61, 51, 0.1); border: 2px solid var(--ink); }
        .srv-label { font-family: var(--font-ui); font-size: 0.6rem; font-weight: 500; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.05em; }
        .srv-price { font-family: var(--font-ui); font-size: 1.4rem; color: var(--ink); font-weight: 500; }

        .date-time-row { display: flex; gap: 20px; margin-bottom: 24px; }
        .date-pill-group { display: flex; align-items: center; gap: 16px; background: white; padding: 14px 24px; border-radius: 20px; border: 1px solid var(--cream-warm); }
        .date-pill-group input { border: none; font-weight: 700; color: var(--ink); }
        .alert-pill { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 12px; font-size: 0.75rem; font-weight: 700; margin-top: 16px; }
        .alert-pill.success { color: var(--ink); background: var(--cream-warm); border: 1px solid rgba(26,61,51,0.1); }
        .alert-pill.warning { color: var(--gold); background: var(--cream-warm); border: 1px solid var(--gold); }

        .job-type-tabs { display: flex; gap: 4px; background: var(--cream-warm); padding: 4px; border-radius: 12px; width: fit-content; }
        .type-tab { padding: 8px 24px; border-radius: 10px; border: none; font-weight: 700; color: var(--ink-soft); cursor: pointer; transition: all 0.2s; }
        .type-tab.active { background: white; color: var(--ink); box-shadow: 0 4px 10px rgba(0,0,0,0.05); }

        .frequency-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 16px; }
        .freq-pill { padding: 10px; border-radius: 12px; border: 1px solid var(--cream-warm); background: white; font-weight: 700; color: var(--ink-soft); cursor: pointer; transition: all 0.2s; }
        .freq-pill.active { background: var(--ink); color: white; border-color: var(--ink); }

        .voucher-card { padding: 40px; border-radius: 32px; border: 2px dashed var(--cream-warm); background: white !important; margin-bottom: 40px; }
        .voucher-header { display: flex; justify-content: space-between; border-bottom: 1px solid var(--cream-warm); padding-bottom: 24px; margin-bottom: 32px; }
        .v-logo { font-family: var(--font-headings); font-size: 1.4rem; font-weight: 400; color: var(--ink); }
        .v-badge { font-family: var(--font-ui); background: var(--gold); color: white; padding: 4px 12px; border-radius: 6px; font-weight: 500; font-size: 0.55rem; text-transform: uppercase; letter-spacing: 0.1em; }
        .v-row { display: flex; justify-content: space-between; margin-bottom: 12px; }
        .v-label { font-family: var(--font-ui); font-size: 0.6rem; font-weight: 500; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.1em; }
        .v-val { font-weight: 700; color: var(--ink); }
        .v-row.total { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--cream-warm); }
        .v-row.total .v-val { font-size: 1.5rem; }
        .voucher-footer { text-align: center; font-size: 0.75rem; color: var(--ink-soft); margin-top: 24px; }

        .form-actions { display: flex; gap: 16px; margin-top: 40px; }
        .btn-primary { background: var(--ink); color: white; border: none; padding: 16px 32px; border-radius: 18px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 12px; }
        .btn-secondary { background: white; color: var(--ink); border: 1px solid var(--cream-warm); padding: 16px 32px; border-radius: 18px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 12px; }
        .btn-text { background: transparent; border: none; color: var(--ink-soft); font-weight: 700; cursor: pointer; }

        .success-card.tc-waiting { border-top: 6px solid var(--gold); }
        .pulse-icon.warning { color: var(--gold); }
        .status-progress { margin: 24px 0; background: var(--cream-warm); padding: 16px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .progress-label { font-size: 0.6rem; font-weight: 900; color: var(--gold); letter-spacing: 1px; }

        .fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .fade-out { animation: fadeOut 0.3s ease-in forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-10px); } }

        @media (max-width: 700px) {
          .form-container { padding: 32px 16px; }
          .form-header { margin-bottom: 32px; }
          .form-header h1 { font-size: 1.8rem; }
          .form-header p { font-size: 0.9rem; }
          .header-icon-pill { width: 36px; height: 36px; margin-bottom: 12px; }
          
          .step-tracker { margin-bottom: 32px; gap: 8px; }
          .step-circle { width: 32px; height: 32px; font-size: 0.8rem; }
          .step-label { font-size: 0.5rem; }
          .step-connector { top: 16px; left: calc(50% + 16px); width: calc(100% - 32px); }

          .glass-card { padding: 20px; border-radius: 24px; }
          .card-top-info { margin-bottom: 20px; }
          .card-top-info h3 { font-size: 1.1rem; }

          .input-grid { grid-template-columns: 1fr; gap: 12px; }
          .input-pill.full { grid-column: span 1; }
          .input-pill { padding: 10px 16px; border-radius: 14px; gap: 8px; }
          .input-pill input, .input-pill textarea { font-size: 0.85rem; }
          
          .selection-group { margin-bottom: 32px; }
          .billing-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
          .billing-btn { padding: 12px; border-radius: 16px; }
          
          .service-grid { grid-template-columns: 1fr; gap: 12px; }
          .service-btn { padding: 16px; border-radius: 20px; }
          .srv-price { font-size: 1.2rem; }

          .date-time-row { flex-direction: column; gap: 12px; }
          .date-pill-group { padding: 12px 16px; border-radius: 16px; }
          .frequency-grid { grid-template-columns: repeat(5, 1fr); gap: 6px; }
          .freq-pill { padding: 8px; font-size: 0.7rem; border-radius: 8px; }

          .voucher-card { padding: 20px; border-radius: 24px; margin-bottom: 24px; }
          .voucher-header { padding-bottom: 16px; margin-bottom: 20px; }
          .v-row.total .v-val { font-size: 1.25rem; }

          .form-actions { margin-top: 24px; flex-direction: column; gap: 12px; }
          .btn-primary, .btn-secondary { padding: 14px 24px; border-radius: 14px; font-size: 0.9rem; }
        }

        /* Processing Loader Styles */
        .processing-card { border-top: 6px solid var(--ink); }
        .processing-icon-area { display: flex; justify-content: center; margin-bottom: 24px; }
        .processing-spinner { position: relative; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; }
        .spinner-ring { position: absolute; width: 100%; height: 100%; border: 4px solid var(--cream-warm); border-top-color: var(--ink); border-radius: 50%; animation: spin 1s infinite linear; }
        .rocket-icon { color: var(--ink); animation: rocketFloat 2s infinite ease-in-out; }
        
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes rocketFloat { 
          0%, 100% { transform: translateY(0) rotate(0deg); } 
          50% { transform: translateY(-10px) rotate(5deg); } 
        }

        .progress-container-premium { width: 100%; margin-top: 32px; }
        .progress-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-family: var(--font-ui); }
        .current-status { font-size: 0.75rem; font-weight: 700; color: var(--ink); text-transform: uppercase; letter-spacing: 0.5px; }
        .percentage { font-size: 0.8rem; font-weight: 900; color: var(--ink-soft); }
        
        .progress-bar-bg { width: 100%; height: 8px; background: var(--cream-warm); border-radius: 10px; overflow: hidden; margin-bottom: 16px; }
        .progress-bar-fill { height: 100%; background: var(--ink); border-radius: 10px; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
        
        .steps-indicator { display: flex; justify-content: space-between; padding: 0 4px; }
        .step-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--cream-warm); transition: all 0.3s; }
        .step-dot.active { background: var(--ink); transform: scale(1.5); box-shadow: 0 0 10px rgba(26,61,51,0.2); }
        .step-dot.done { background: var(--ink); opacity: 0.5; }
        .unified-route-card { display: flex; flex-direction: column; position: relative; gap: 16px; margin: 32px 0; padding: 24px; background: rgba(255, 255, 255, 0.4); border-radius: 24px; border: 1px dashed var(--cream-warm); }
        .route-segment { position: relative; padding: 24px; border-radius: 16px; border: 1px solid var(--cream-warm); transition: all 0.3s; display: flex; flex-direction: column; gap: 12px; }
        .locked-segment.dark-theme { background: var(--ink); color: white; border: none; }
        .locked-segment.dark-theme .route-label { color: rgba(255,255,255,0.6); }
        .locked-segment.dark-theme .lock-icon { color: rgba(255,255,255,0.6); }
        .locked-segment.dark-theme .address-header { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px; }
        .active-segment.elevated { background: white; box-shadow: 0 12px 30px rgba(26,61,51,0.08); border-color: transparent; }
        
        .swap-button-container { position: absolute; right: 48px; top: 50%; transform: translateY(-50%); z-index: 10; }
        .swap-route-btn { width: 56px; height: 56px; border-radius: 50%; background: white; border: 1px solid var(--cream-warm); color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
        .swap-route-btn:hover { transform: scale(1.1); }
        
        .address-header { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.8rem; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 24px; color: var(--ink-soft); }
        .active-segment.elevated .route-label { color: var(--gold); margin-bottom: 12px; font-size: 0.75rem; letter-spacing: 0.1em; font-weight: 800; }
        
        .locked-address-display strong { font-size: 1.2rem; display: block; margin-bottom: 4px; }
        .locked-address-display p { font-size: 0.9rem; opacity: 0.8; margin: 0; }
        
        .transparent-input { background: transparent; border: none; width: 100%; font-size: 1rem; color: inherit; outline: none; }
        .transparent-input::placeholder { color: #a0aec0; font-weight: 500; }
        
        .transparent-input.company { font-size: 1.25rem; font-weight: 600; padding: 8px 0; border-bottom: 1px solid var(--cream-warm); margin-bottom: 20px; transition: border-color 0.3s; color: var(--ink); }
        .transparent-input.company:focus { border-bottom-color: var(--ink); }
        
        .transparent-input.address { font-size: 1rem; color: var(--ink); }
        .search-input-wrapper { display: flex; align-items: center; background: #f7fafc; padding: 14px 20px; border-radius: 12px; border: 1px solid transparent; transition: all 0.3s; }
        .search-input-wrapper:focus-within { background: white; border-color: var(--ink); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        
        .dark-theme .transparent-input { color: white; }
        .dark-theme .transparent-input::placeholder { color: rgba(255,255,255,0.5); }

        /* Premium Locked Segment styling */
        .locked-segment.dark-theme { background: #1f362a; color: white; border: none; overflow: hidden; padding: 24px 32px; border-radius: 20px; box-shadow: 0 12px 24px rgba(31,54,42,0.15); }
        .locked-segment.dark-theme .bg-glow { position: absolute; top: -50px; right: -50px; width: 250px; height: 250px; background: radial-gradient(circle, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 70%); border-radius: 50%; pointer-events: none; }
        
        .locked-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; position: relative; z-index: 1; }
        .route-title { display: flex; align-items: center; gap: 8px; color: rgba(255,255,255,0.7); font-weight: 600; font-size: 0.9rem; letter-spacing: 0.05em; text-transform: uppercase; }
        .hub-badge { background: rgba(255,255,255,0.1); color: white; padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; backdrop-filter: blur(4px); }
        
        .locked-address-display { position: relative; z-index: 1; }
        .locked-address-display strong { font-size: 1.4rem; display: block; margin-bottom: 8px; color: white; }
        .locked-address-display p { font-size: 1.05rem; color: rgba(255,255,255,0.8); margin: 0 0 24px 0; }
        .address-bottom span { color: #d6b484; font-size: 0.95rem; font-weight: 500; }

      `}</style>
    </div>
  );
};

export default NewJobForm;
