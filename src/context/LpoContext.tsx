import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, createUserWithEmailAndPassword, type User } from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc, collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { requestNotificationPermission, saveTokenToFirestore } from '../utils/notifications';

export interface ParentEntity {
  id: string;
  name: string;
  location: string;
  address: string;
  latitude?: number;
  longitude?: number;
  franchiseeTerritoryJSON?: string | string[];
}

export interface CustomerMetadata {
  id: string;
  name: string;
  address: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  email?: string;
  mobile?: string;
}

export interface UserMetadata {
  uid: string;
  email: string;
  first_name?: string;
  last_name?: string;
  mobile?: string;
  parent_id?: string;
  customer_id?: string;
  role: 'superadmin' | 'admin' | 'lpoadmin' | 'operator' | 'customer';
  hasCompletedTour: boolean;
}

export interface ImpersonationState {
  role: 'superadmin' | 'admin' | 'lpoadmin' | 'operator' | 'customer';
  parent_id?: string;
  customer_id?: string;
  uid?: string;
}

interface LpoContextType {
  user: User | null;
  userData: UserMetadata | null;
  parent: ParentEntity | null;
  customer: CustomerMetadata | null;
  loading: boolean;
  isSidebarPinned: boolean;
  setIsSidebarPinned: (pinned: boolean) => void;
  hasCompletedTour: boolean;
  completeTour: () => Promise<void>;
  updateUserData: (data: Partial<UserMetadata>) => Promise<void>;
  isAdmin: boolean;
  selectedParentId: string; // Used by admins to filter, defaults to own parent_id or 'all'
  setSelectedParentId: (id: string) => void;
  allParents: ParentEntity[];
  awaitingTcCount: number;
  signUp: (email: string, password: string, firstName: string, lastName: string, phone: string, parentId?: string, customerId?: string) => Promise<any>;
  impersonation: ImpersonationState | null;
  setImpersonation: (state: ImpersonationState | null) => void;
  isRealSuperAdmin: boolean;
}

const SUPER_ADMIN_ID = 'lwOQ8j5MSIdOiyR0VZ1zEvfpx7A3';

const LpoContext = createContext<LpoContextType>({
  user: null,
  userData: null,
  parent: null,
  customer: null,
  loading: true,
  isSidebarPinned: false,
  setIsSidebarPinned: () => {},
  hasCompletedTour: true,
  completeTour: async () => {},
  updateUserData: async () => {},
  isAdmin: false,
  selectedParentId: 'all',
  setSelectedParentId: () => {},
  allParents: [],
  awaitingTcCount: 0,
  signUp: async () => {},
  impersonation: null,
  setImpersonation: () => {},
  isRealSuperAdmin: false,
});

export const LpoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [baseUserData, setBaseUserData] = useState<UserMetadata | null>(null);
  const [parent, setParent] = useState<ParentEntity | null>(null);
  const [customer, setCustomer] = useState<CustomerMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [hasCompletedTour, setHasCompletedTour] = useState(true);
  const [selectedParentId, setSelectedParentId] = useState<string>('all');
  const [allParents, setAllParents] = useState<ParentEntity[]>([]);
  const [awaitingTcCount, setAwaitingTcCount] = useState(0);
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(() => {
    const saved = localStorage.getItem('localmile_impersonation');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (impersonation) {
      localStorage.setItem('localmile_impersonation', JSON.stringify(impersonation));
    } else {
      localStorage.removeItem('localmile_impersonation');
    }
  }, [impersonation]);

  const isRealSuperAdmin = baseUserData?.role === 'superadmin' || user?.email?.toLowerCase() === 'ankith.ravindran@mailplus.com.au' || user?.uid === SUPER_ADMIN_ID;

  const userData = React.useMemo(() => {
    if (isRealSuperAdmin && impersonation && baseUserData) {
      return {
        ...baseUserData,
        role: impersonation.role,
        parent_id: impersonation.parent_id || '',
        customer_id: impersonation.customer_id || '',
        uid: impersonation.uid || baseUserData.uid,
      };
    }
    return baseUserData;
  }, [baseUserData, impersonation, isRealSuperAdmin]);

  const isAdmin = userData?.role === 'admin' || userData?.role === 'superadmin' || userData?.uid === SUPER_ADMIN_ID;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Add a small delay to prevent Firestore SDK deadlocks caused by concurrent getDoc/setDoc during registration
        await new Promise(resolve => setTimeout(resolve, 800));
        try {
          let userDoc = await getDoc(doc(db, 'users', user.uid));
          
          if (!userDoc.exists() && user.email) {
            userDoc = await getDoc(doc(db, 'users', user.email));
          }

          if (userDoc.exists()) {
            const data = userDoc.data() as UserMetadata;
            setBaseUserData({ ...data, uid: user.uid });
            const parentId = data.parent_id;
            setHasCompletedTour(data.hasCompletedTour || false);
            
            const isUserAdmin = data.role === 'admin' || data.role === 'superadmin' || user.uid === SUPER_ADMIN_ID;

            if (!isUserAdmin && parentId) {
              setSelectedParentId(parentId);
            }

            if (parentId) {
              requestNotificationPermission().then(token => {
                if (token) {
                  saveTokenToFirestore(token, 'operator', user.uid);
                }
              });
            } else if (data.customer_id) {
              requestNotificationPermission().then(token => {
                if (token) {
                  saveTokenToFirestore(token, 'customer', user.uid);
                }
              });
            }
          } else if (user.uid === SUPER_ADMIN_ID || user.email?.toLowerCase() === 'ankith.ravindran@mailplus.com.au') {
            const adminData: UserMetadata = { 
              uid: user.uid, 
              email: user.email || '', 
              role: 'superadmin', 
              parent_id: '',
              customer_id: '',
              hasCompletedTour: true
            };
            setBaseUserData(adminData);
            
            // Avoid concurrent setDoc with signUp by waiting and checking
            setTimeout(() => {
              getDoc(doc(db, 'users', user.uid)).then(d => {
                if (!d.exists()) {
                  setDoc(doc(db, 'users', user.uid), adminData).catch(e => console.error("Auto-seed error:", e));
                }
              });
            }, 3000);
          }

          if (user.uid === SUPER_ADMIN_ID || user.email?.toLowerCase() === 'ankith.ravindran@mailplus.com.au' || userDoc.data()?.role === 'admin' || userDoc.data()?.role === 'superadmin') {
            const parentsSnapshot = await getDocs(collection(db, 'lpo'));
            setAllParents(parentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ParentEntity)));
          }

        } catch (error) {
          console.error("Error fetching context metadata:", error);
        }
      } else {
        setBaseUserData(null);
        setParent(null);
        setCustomer(null);
        setHasCompletedTour(true);
        setAllParents([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    const fetchContextEntities = async () => {
      if (!userData) {
        setParent(null);
        setCustomer(null);
        return;
      }
      if (userData.parent_id) {
        const parentDoc = await getDoc(doc(db, 'lpo', userData.parent_id));
        if (active && parentDoc.exists()) {
          setParent({ id: userData.parent_id, ...parentDoc.data() } as ParentEntity);
          setCustomer(null);
        }
      } else if (userData.customer_id) {
        if (userData.customer_id === 'test_standalone_customer') {
          if (active) {
            setCustomer({ id: 'test_standalone_customer', name: 'Simulated Customer', address: '123 Fake Street', email: 'test@example.com' });
            setParent(null);
          }
        } else {
          const customerDoc = await getDoc(doc(db, 'customers', userData.customer_id));
          if (active && customerDoc.exists()) {
            setCustomer({ id: userData.customer_id, ...customerDoc.data() } as CustomerMetadata);
            setParent(null);
          }
        }
      } else {
        if (active) {
          setParent(null);
          setCustomer(null);
        }
      }
    };
    fetchContextEntities();
    return () => { active = false; };
  }, [userData?.parent_id, userData?.customer_id]);

  useEffect(() => {
    if (!user) {
      setAwaitingTcCount(0);
      return;
    }

    const reqRef = collection(db, 'requests');
    let q;
    
    if (isAdmin) {
      if (selectedParentId === 'all') {
        q = query(reqRef, where('status', '==', 'awaiting-activation'));
      } else {
        q = query(reqRef, where('status', '==', 'awaiting-activation'), where('parent_id', '==', selectedParentId));
      }
    } else if (userData?.parent_id) {
      q = query(reqRef, where('status', '==', 'awaiting-activation'), where('parent_id', '==', userData.parent_id));
    } else {
      setAwaitingTcCount(0);
      return;
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAwaitingTcCount(snapshot.size);
    });

    return () => unsubscribe();
  }, [user, isAdmin, selectedParentId, userData?.parent_id]);

  const completeTour = async () => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { hasCompletedTour: true });
      setHasCompletedTour(true);
      setBaseUserData(prev => prev ? { ...prev, hasCompletedTour: true } : null);
    } catch (error) {
      console.error("Error completing tour:", error);
      setHasCompletedTour(true);
    }
  };

  const updateUserData = async (data: Partial<UserMetadata>) => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, data);
      setBaseUserData(prev => prev ? { ...prev, ...data } : null);
    } catch (error) {
      console.error("Error updating user data:", error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, firstName: string, lastName: string, phone: string, parentId?: string, customerId?: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const newUser = userCredential.user;

    const userDocRef = doc(db, "users", newUser.uid);
    const isSuperAdmin = newUser.email?.toLowerCase() === 'ankith.ravindran@mailplus.com.au';
    const newUserData: UserMetadata = {
      uid: newUser.uid,
      email: newUser.email || email,
      first_name: firstName,
      last_name: lastName,
      mobile: phone,
      parent_id: parentId || "",
      customer_id: customerId || "",
      role: isSuperAdmin ? 'superadmin' : (customerId ? 'customer' : 'operator'),
      hasCompletedTour: isSuperAdmin ? true : false,
    };

    await setDoc(userDocRef, newUserData);
    setBaseUserData(newUserData);
    
    return userCredential;
  };

  return (
    <LpoContext.Provider value={{ 
      user, 
      userData,
      parent, 
      customer,
      loading, 
      isSidebarPinned, 
      setIsSidebarPinned, 
      hasCompletedTour, 
      completeTour,
      updateUserData,
      isAdmin,
      selectedParentId,
      setSelectedParentId,
      allParents,
      awaitingTcCount,
      signUp,
      impersonation,
      setImpersonation,
      isRealSuperAdmin
    }}>
      {children}
    </LpoContext.Provider>
  );
};

export const useLpo = () => useContext(LpoContext);
