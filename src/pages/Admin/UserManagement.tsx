// Head Office User Management Page
import React, { useEffect, useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Mail, 
  Shield, 
  Building2, 
  Trash2, 
  X,
  Lock,
  Key,
  Edit2,
  RefreshCw,
  Camera
} from 'lucide-react';
import { collection, query, getDocs, doc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase/config';
import { useLpo, isSuperAdminUid } from '../../context/LpoContext';
import LoadingScreen from '../../components/LoadingScreen';
import { fetchTargetCompanyName, TARGET_COMPANY_ID } from '../../utils/operatorAccess';

interface UserRecord {
  uid: string;
  email: string;
  role: string;
  parent_id: string;
  lpoName?: string;
  customer_id?: string;
  customerName?: string;
}

const UserManagement: React.FC = () => {
  const { allParents, isAdmin, userData } = useLpo();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const isSuperAdmin = userData?.role === 'superadmin' || isSuperAdminUid(userData?.uid);

  // New User Form State
  const [newUser, setNewUser] = useState({
    email: '',
    role: 'parent',
    parent_id: '',
    password: ''
  });
  const [grantProofAccessOnCreate, setGrantProofAccessOnCreate] = useState(false);

  // Active Tab ('users' | 'proof_access')
  const [activeTab, setActiveTab] = useState<'users' | 'proof_access'>('users');
  const [targetCompanyName, setTargetCompanyName] = useState('');

  // Reset Password State
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Edit User State
  const [editTarget, setEditTarget] = useState<UserRecord | null>(null);
  const [editEmail, setEditEmail] = useState('');

  // Proof Upload Access (Company 1868657) State
  const [proofAccessList, setProofAccessList] = useState<
    Array<{ id: string; email: string; label?: string | null; grantedBy?: string; active: boolean }>
  >([]);
  const [proofAccessEmail, setProofAccessEmail] = useState('');
  const [proofAccessLabel, setProofAccessLabel] = useState('');
  const [proofAccessSubmitting, setProofAccessSubmitting] = useState(false);
  const [proofAccessMessage, setProofAccessMessage] = useState<string | null>(null);

  const fetchProofAccess = async () => {
    try {
      const snap = await getDocs(collection(db, `companies/${TARGET_COMPANY_ID}/proof_upload_access`));
      const list = snap.docs
        .map((d) => ({
          id: d.id,
          email: (d.data().email || d.id).toString(),
          label: d.data().label || null,
          grantedBy: d.data().grantedBy || '',
          active: d.data().active === true,
        }))
        .filter((item) => item.active)
        .sort((a, b) => a.email.localeCompare(b.email));
      setProofAccessList(list);
    } catch (err) {
      console.error('Error fetching proof upload access list:', err);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const companiesQ = query(collection(db, 'companies'));
      const companiesSnapshot = await getDocs(companiesQ);
      const companiesMap = new Map();
      companiesSnapshot.docs.forEach(doc => {
         companiesMap.set(doc.id, doc.data().companyName);
      });

      const q = query(collection(db, 'users'));
      const snapshot = await getDocs(q);
      const userList = snapshot.docs.map(doc => {
        const data = doc.data();
        const parent = allParents.find(l => l.id === data.parent_id);
        const customerName = data.customer_id ? companiesMap.get(data.customer_id) || 'Unknown' : 'N/A';
        return {
          uid: doc.id,
          email: data.email,
          role: data.role,
          parent_id: data.parent_id,
          lpoName: parent?.name || 'N/A',
          customer_id: data.customer_id,
          customerName
        } as UserRecord;
      });
      setUsers(userList);
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchProofAccess();
      fetchTargetCompanyName().then(setTargetCompanyName);
    }
  }, [isAdmin, allParents]);

  const handleGrantProofAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = proofAccessEmail.trim().toLowerCase();
    if (!normalizedEmail) return;

    setProofAccessSubmitting(true);
    setProofAccessMessage(null);
    try {
      await setDoc(doc(db, `companies/${TARGET_COMPANY_ID}/proof_upload_access`, normalizedEmail), {
        email: normalizedEmail,
        label: proofAccessLabel.trim() || null,
        active: true,
        origin: window.location.origin,
        grantedBy: userData?.email || 'admin',
        grantedAt: serverTimestamp(),
      });
      setProofAccessEmail('');
      setProofAccessLabel('');
      setProofAccessMessage(`Granted proof upload access to ${normalizedEmail}.`);
      await fetchProofAccess();
    } catch (err) {
      console.error('Error granting proof upload access:', err);
      alert('Failed to grant proof upload access.');
    } finally {
      setProofAccessSubmitting(false);
    }
  };

  const handleRevokeProofAccess = async (email: string) => {
    if (!window.confirm(`Revoke Company ${TARGET_COMPANY_ID} proof upload access for ${email}?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, `companies/${TARGET_COMPANY_ID}/proof_upload_access`, email.toLowerCase()));
      await fetchProofAccess();
    } catch (err) {
      console.error('Error revoking proof upload access:', err);
      alert('Failed to revoke proof upload access.');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.email || !newUser.password || (newUser.role === 'parent' && !newUser.parent_id)) {
      alert("Please fill in all required fields including password.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSuperAdmin) {
        const adminCreateUser = httpsCallable(functions, 'adminCreateUser');
        await adminCreateUser({
          email: newUser.email,
          password: newUser.password,
          role: newUser.role,
          parent_id: (newUser.role === 'admin' || newUser.role === 'superadmin') ? '' : newUser.parent_id
        });

        if (grantProofAccessOnCreate) {
          const normalizedEmail = newUser.email.trim().toLowerCase();
          await setDoc(doc(db, `companies/${TARGET_COMPANY_ID}/proof_upload_access`, normalizedEmail), {
            email: normalizedEmail,
            label: null,
            active: true,
            origin: window.location.origin,
            grantedBy: userData?.email || 'admin',
            grantedAt: serverTimestamp(),
          });
          await fetchProofAccess();
        }

        alert("User account created successfully.");
      } else {
        // Fallback for regular admins (legacy behavior)
        alert("Only Super Admins can create auth-enabled user accounts currently.");
        setIsSubmitting(false);
        return;
      }

      setIsModalOpen(false);
      setNewUser({ email: '', role: 'parent', parent_id: '', password: '' });
      setGrantProofAccessOnCreate(false);
      fetchUsers();
    } catch (err: any) {
      console.error("Error creating user:", err);
      alert(`Failed to create user: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || !newPassword) return;

    if (newPassword.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }

    setIsSubmitting(true);
    try {
      const adminResetPassword = httpsCallable(functions, 'adminResetPassword');
      await adminResetPassword({
        uid: resetTarget.uid,
        newPassword: newPassword
      });
      
      alert(`Password for ${resetTarget.email} has been reset successfully.`);
      setIsResetModalOpen(false);
      setResetTarget(null);
      setNewPassword('');
    } catch (err: any) {
      console.error("Error resetting password:", err);
      alert(`Failed to reset password: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !editEmail) return;

    setIsSubmitting(true);
    try {
      const adminUpdateUser = httpsCallable(functions, 'adminUpdateUser');
      await adminUpdateUser({
        uid: editTarget.uid,
        email: editEmail
      });
      
      alert(`User email has been updated successfully.`);
      setIsEditModalOpen(false);
      setEditTarget(null);
      setEditEmail('');
      fetchUsers();
    } catch (err: any) {
      console.error("Error updating user:", err);
      alert(`Failed to update user: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (uid: string, email: string) => {
    if (!window.confirm(`Are you sure you want to remove access for ${email}?`)) return;
    
    try {
      await deleteDoc(doc(db, 'users', uid));
      setUsers(users.filter(u => u.uid !== uid));
    } catch (err) {
      console.error("Error deleting user:", err);
      alert("Failed to delete user.");
    }
  };

  const handleRecreateSecurityCode = async (email: string) => {
    if (!window.confirm(`Are you sure you want to recreate the security code for ${email}?`)) return;
    try {
      const adminRecreateSecurityCode = httpsCallable(functions, 'adminRecreateSecurityCode');
      await adminRecreateSecurityCode({ email });
      alert("Security code recreated successfully.");
    } catch (err: any) {
      console.error("Error recreating security code:", err);
      alert(`Failed to recreate security code: ${err.message}`);
    }
  };

  const handleResendAuthEmail = async (email: string) => {
    if (!window.confirm(`Are you sure you want to resend the authentication email for ${email}?`)) return;
    try {
      const adminResendAuthEmail = httpsCallable(functions, 'adminResendAuthEmail');
      await adminResendAuthEmail({ email });
      alert("Authentication email sent successfully.");
    } catch (err: any) {
      console.error("Error resending auth email:", err);
      alert(`Failed to resend auth email: ${err.message}`);
    }
  };

  const filteredUsers = users.filter(u => 
    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.lpoName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.role || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="user-mgmt-premium">
      <div className="content-container">
        <header className="page-header">
          <div className="header-left">
            <div className="title-area">
              <Users className="header-icon" />
              <div>
                <h1>User Management</h1>
                <p>Manage portal accounts and Proof of Delivery upload access.</p>
              </div>
            </div>
          </div>
          <div className="header-right">
            <button
              type="button"
              onClick={() => setActiveTab('proof_access')}
              className="btn-secondary-action"
            >
              <Camera size={18} />
              <span>Proof Upload Access</span>
            </button>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="btn-premium-action"
            >
              <UserPlus size={18} />
              <span>Create New User</span>
            </button>
          </div>
        </header>

        {/* Above-the-fold Tab Bar */}
        <div className="um-tabs" role="tablist" aria-label="User management sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'users'}
            className={`um-tab ${activeTab === 'users' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={16} />
            <span>Portal Users</span>
            <span className="um-tab-count">{users.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'proof_access'}
            className={`um-tab ${activeTab === 'proof_access' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('proof_access')}
          >
            <Camera size={16} />
            <span>Proof Upload Access</span>
            <span className="um-tab-count">{proofAccessList.length}</span>
          </button>
        </div>

        {activeTab === 'users' ? (
          <>
            <div className="filter-bar">
              <div className="search-pill">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search by email, parent, or role..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <LoadingScreen fullScreen={false} message="Syncing User Directory" />
            ) : (
              <div className="users-table-container card">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>User Details</th>
                      <th>Role</th>
                      <th>Assigned Parent</th>
                      <th>Linked Customer</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.uid}>
                        <td>
                          <div className="user-cell">
                            <div className={`user-avatar ${u.role || ''}`}>
                              {u.email ? u.email[0].toUpperCase() : 'U'}
                            </div>
                            <div className="user-info">
                              <span className="user-email">{u.email || 'No email'}</span>
                              <span className="user-id">UID: {(u.uid || '').substring(0, 8)}...</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={`role-tag ${u.role || ''}`}>
                            {(u.role === 'admin' || u.role === 'superadmin') ? <Shield size={12} /> : <Users size={12} />}
                            <span>{u.role === 'superadmin' ? 'SUPER ADMIN' : (u.role || 'USER').toUpperCase()}</span>
                          </div>
                        </td>
                        <td>
                          <div className="lpo-cell">
                            {(u.role === 'admin' || u.role === 'superadmin') ? (
                              <span className="global-access">Global Access</span>
                            ) : (
                              <>
                                <Building2 size={14} />
                                <span>{u.lpoName}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="lpo-cell">
                            <span>{u.customerName}</span>
                          </div>
                        </td>
                        <td className="text-right">
                          <div className="table-actions">
                            {isSuperAdmin && (
                              <>
                                <button
                                  className="btn-icon-warning"
                                  onClick={() => {
                                    setEditTarget(u);
                                    setEditEmail(u.email);
                                    setIsEditModalOpen(true);
                                  }}
                                  title="Edit User Email"
                                >
                                  <Edit2 size={18} />
                                </button>
                                <button
                                  className="btn-icon-warning"
                                  onClick={() => {
                                    setResetTarget(u);
                                    setIsResetModalOpen(true);
                                  }}
                                  title="Reset Password"
                                >
                                  <Key size={18} />
                                </button>
                                <button
                                  className="btn-icon-warning"
                                  onClick={() => handleRecreateSecurityCode(u.email)}
                                  title="Recreate Security Code"
                                >
                                  <RefreshCw size={18} />
                                </button>
                                <button
                                  className="btn-icon-warning"
                                  onClick={() => handleResendAuthEmail(u.email)}
                                  title="Resend Auth Email"
                                >
                                  <Mail size={18} />
                                </button>
                              </>
                            )}
                            <button
                              className="btn-icon-danger"
                              onClick={() => handleDeleteUser(u.uid, u.email)}
                              title="Remove Access"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="empty-row">
                          No users found matching your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="card proof-access-panel">
            <div className="proof-access-header">
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                  {targetCompanyName ? `${targetCompanyName} — Proof Upload Access` : 'Proof Upload Access'}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--ink-soft)' }}>
                  Grant or revoke email access for franchisees &amp; operators to sign in at <code>/operator/signin</code> and upload Proof of Delivery or Excess Weight images.
                </p>
              </div>
            </div>

            <form onSubmit={handleGrantProofAccess} className="proof-access-form">
              <input
                type="email"
                placeholder="franchisee@example.com"
                value={proofAccessEmail}
                onChange={(e) => setProofAccessEmail(e.target.value)}
                required
                className="proof-access-input proof-access-input--email"
              />
              <input
                type="text"
                placeholder="Franchisee / Operator Name (optional)"
                value={proofAccessLabel}
                onChange={(e) => setProofAccessLabel(e.target.value)}
                className="proof-access-input proof-access-input--name"
              />
              <button
                type="submit"
                className="btn-premium-action"
                disabled={proofAccessSubmitting}
              >
                {proofAccessSubmitting ? 'Granting...' : 'Grant Access'}
              </button>
            </form>

            {proofAccessMessage && (
              <div className="proof-access-success" role="status">
                {proofAccessMessage}
              </div>
            )}

            <div className="users-table-container" style={{ border: '1px solid var(--cream-warm)', borderRadius: '12px' }}>
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Email Address</th>
                    <th>Name / Label</th>
                    <th>Granted By</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {proofAccessList.map((entry) => (
                    <tr key={entry.id}>
                      <td><strong>{entry.email}</strong></td>
                      <td>{entry.label || '—'}</td>
                      <td>{entry.grantedBy || 'Admin'}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn-icon-danger"
                          onClick={() => handleRevokeProofAccess(entry.email)}
                          title="Revoke Proof Upload Access"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {proofAccessList.length === 0 && (
                    <tr>
                      <td colSpan={4} className="empty-row">
                        No email-based proof upload grants added yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      <div className={`modal-overlay ${isModalOpen ? 'active' : ''}`}>
        <div className="modal-content glass fade-in">
          <div className="modal-header">
            <div className="header-title">
              <UserPlus size={20} />
              <h2>Create New User</h2>
            </div>
            <button className="close-btn" onClick={() => setIsModalOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleCreateUser} className="create-user-form">
            <div className="form-section">
              <label className="m-label">Email Address</label>
              <div className="input-wrapper-glass">
                <Mail size={18} />
                <input 
                  type="email" 
                  placeholder="name@mailplus.com.au" 
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="form-section">
              <label className="m-label">Initial Password</label>
              <div className="input-wrapper-glass">
                <Lock size={18} />
                <input 
                  type="password" 
                  placeholder="Set account password" 
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  required
                  minLength={6}
                />
              </div>
            </div>

             <div className="form-section">
              <label className="m-label">System Role</label>
              <div className="role-selector">
                <button 
                  type="button"
                  className={`role-btn ${newUser.role === 'parent' ? 'active' : ''}`}
                  onClick={() => setNewUser({...newUser, role: 'parent'})}
                >
                  <Users size={18} />
                  <span>Parent Operator</span>
                </button>
                <button 
                  type="button"
                  className={`role-btn ${newUser.role === 'admin' ? 'active' : ''}`}
                  onClick={() => setNewUser({...newUser, role: 'admin'})}
                >
                  <Shield size={18} />
                  <span>Head Office Admin</span>
                </button>
              </div>
            </div>

            {(newUser.role === 'parent') && (
              <div className="form-section fade-in">
                <label className="m-label">Assign to Parent</label>
                <div className="input-wrapper-glass">
                  <Building2 size={18} />
                  <select 
                    value={newUser.parent_id}
                    onChange={(e) => setNewUser({...newUser, parent_id: e.target.value})}
                    required={newUser.role === 'parent'}
                  >
                    <option value="">Select a Parent Account</option>
                    {allParents.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <label className="um-checkbox-row">
              <input
                type="checkbox"
                checked={grantProofAccessOnCreate}
                onChange={(e) => setGrantProofAccessOnCreate(e.target.checked)}
              />
              <span>Also grant Proof of Delivery &amp; Excess Weight upload access</span>
            </label>

            <div className="modal-actions">
              <button 
                type="button" 
                className="btn-secondary-glass" 
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn-primary-glass"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Confirm & Create'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Reset Password Modal */}
      <div className={`modal-overlay ${isResetModalOpen ? 'active' : ''}`}>
        <div className="modal-content glass fade-in">
          <div className="modal-header">
            <div className="header-title">
              <Key size={20} />
              <h2>Reset Password</h2>
            </div>
            <button className="close-btn" onClick={() => {
              setIsResetModalOpen(false);
              setResetTarget(null);
            }}>
              <X size={20} />
            </button>
          </div>

          <p className="modal-info-text">
            Setting a new password for <strong>{resetTarget?.email}</strong>. 
            The user will need to use this new password for their next sign in.
          </p>

          <form onSubmit={handleResetPassword} className="create-user-form">
            <div className="form-section">
              <label className="m-label">New Password</label>
              <div className="input-wrapper-glass">
                <Lock size={18} />
                <input 
                  type="password" 
                  placeholder="Enter new password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  autoFocus
                />
              </div>
            </div>

            <div className="modal-actions">
              <button 
                type="button" 
                className="btn-secondary-glass" 
                onClick={() => {
                  setIsResetModalOpen(false);
                  setResetTarget(null);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn-primary-glass"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Resetting...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Edit User Modal */}
      <div className={`modal-overlay ${isEditModalOpen ? 'active' : ''}`}>
        <div className="modal-content glass fade-in">
          <div className="modal-header">
            <div className="header-title">
              <Edit2 size={20} />
              <h2>Edit User Details</h2>
            </div>
            <button className="close-btn" onClick={() => {
              setIsEditModalOpen(false);
              setEditTarget(null);
            }}>
              <X size={20} />
            </button>
          </div>

          <p className="modal-info-text">
            Update account details for user <strong>{editTarget?.uid.substring(0, 8)}</strong>.
          </p>

          <form onSubmit={handleUpdateUser} className="create-user-form">
            <div className="form-section">
              <label className="m-label">Email Address</label>
              <div className="input-wrapper-glass">
                <Mail size={18} />
                <input 
                  type="email" 
                  placeholder="name@mailplus.com.au" 
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="modal-actions">
              <button 
                type="button" 
                className="btn-secondary-glass" 
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditTarget(null);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn-primary-glass"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Updating...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <style>{`
        .user-mgmt-premium { min-height: 100vh; background: var(--offwhite); }

        .content-container { max-width: 1200px; margin: 0 auto; padding: 32px 24px 80px; }

        .page-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
        .title-area { display: flex; gap: 16px; align-items: center; }
        .header-icon { width: 38px; height: 38px; color: var(--sidebar-bg, #095c7b); flex-shrink: 0; }
        .page-header h1 { font-family: var(--font-headings); font-size: 1.9rem; font-weight: 600; color: var(--ink); margin: 0; letter-spacing: -0.02em; }
        .page-header p { margin: 2px 0 0; color: var(--ink-soft); font-size: 0.92rem; }

        .header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

        .btn-premium-action {
          background: var(--sidebar-bg, #095c7b); color: white; border: none; padding: 11px 20px; border-radius: 10px;
          font-weight: 700; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
          box-shadow: 0 4px 12px rgba(9, 92, 123, 0.2); transition: background-color 0.16s ease, transform 0.16s ease;
        }
        .btn-premium-action:hover:not(:disabled) { background: #074b65; transform: translateY(-1px); }
        .btn-premium-action:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
        .btn-premium-action:disabled { opacity: 0.65; cursor: not-allowed; }

        .btn-secondary-action {
          background: var(--paper, #FFFFFF); color: var(--ink); border: 1px solid #d5d0c3; padding: 11px 18px; border-radius: 10px;
          font-weight: 700; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
          transition: background-color 0.16s ease, border-color 0.16s ease;
        }
        .btn-secondary-action:hover { background: var(--cream-warm); border-color: #bfb8a8; }
        .btn-secondary-action:focus-visible { outline: 2px solid var(--sidebar-bg, #095c7b); outline-offset: 2px; }

        .um-tabs {
          display: inline-flex; gap: 6px; padding: 5px; border-radius: 12px;
          background: var(--cream-warm, #F0EDE4); border: 1px solid #e2ddd2; margin-bottom: 20px;
        }
        .um-tab {
          display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 8px;
          background: transparent; color: var(--ink-soft); font-size: 0.88rem; font-weight: 700; cursor: pointer;
          transition: background-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
        }
        .um-tab:hover { color: var(--ink); }
        .um-tab.is-active {
          background: var(--paper, #FFFFFF); color: var(--ink);
          box-shadow: 0 2px 8px rgba(26, 61, 51, 0.08);
        }
        .um-tab-count {
          padding: 2px 8px; border-radius: 999px; font-size: 0.74rem; font-weight: 700;
          background: rgba(9, 92, 123, 0.1); color: var(--sidebar-bg, #095c7b);
          font-variant-numeric: tabular-nums;
        }

        .filter-bar { margin-bottom: 16px; }
        .search-pill { display: flex; align-items: center; gap: 10px; background: white; padding: 0 16px; border-radius: 10px; border: 1px solid #d5d0c3; max-width: 420px; }
        .search-pill input { border: none; background: transparent; padding: 11px 0; width: 100%; font-weight: 500; outline: none; font-size: 0.92rem; }

        .users-table-container { padding: 0; overflow-x: auto; border: 1px solid var(--cream-warm); }
        .users-table { width: 100%; border-collapse: collapse; }
        .users-table th { text-align: left; padding: 14px 20px; font-family: var(--font-ui); font-size: 0.68rem; font-weight: 700; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid var(--cream-warm); background: var(--offwhite); }
        .users-table td { padding: 14px 20px; border-bottom: 1px solid rgba(0,0,0,0.04); }
        .text-right { text-align: right !important; }

        .proof-access-panel { padding: 24px; border: 1px solid var(--cream-warm); }
        .proof-access-header { margin-bottom: 18px; }
        .proof-access-form { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; align-items: center; }
        .proof-access-input { padding: 11px 13px; border-radius: 9px; border: 1px solid #d5d0c3; font-size: 0.92rem; background: var(--paper); width: auto; }
        .proof-access-input--email { flex: 2 1 240px; }
        .proof-access-input--name { flex: 1 1 200px; }
        .proof-access-success { padding: 10px 14px; border-radius: 9px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 0.86rem; font-weight: 600; margin-bottom: 16px; }

        .um-checkbox-row { display: flex; align-items: center; gap: 10px; font-size: 0.86rem; font-weight: 600; color: var(--ink); cursor: pointer; }
        .um-checkbox-row input[type="checkbox"] { width: 17px; height: 17px; accent-color: var(--sidebar-bg, #095c7b); cursor: pointer; }

        .user-cell { display: flex; align-items: center; gap: 14px; }
        .user-avatar { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: white; background: var(--ink-soft); flex-shrink: 0; }
        .user-avatar.superadmin { background: #1a1a1a; }
        .user-avatar.admin { background: var(--ink); }
        .user-avatar.parent, .user-avatar.operator { background: var(--gold); }
        
        .user-info { display: flex; flex-direction: column; }
        .user-email { font-weight: 700; color: var(--ink); font-size: 0.92rem; }
        .user-id { font-size: 0.7rem; color: var(--ink-soft); opacity: 0.65; font-variant-numeric: tabular-nums; }

        .role-tag { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 7px; font-size: 0.7rem; font-weight: 800; }
        .role-tag.superadmin { background: #111827; color: #fff; }
        .role-tag.admin { background: #e8f0fe; color: #1a73e8; }
        .role-tag.parent, .role-tag.operator { background: #fff4e5; color: #b45309; }

        .lpo-cell { display: flex; align-items: center; gap: 8px; color: var(--ink-soft); font-weight: 600; font-size: 0.88rem; }
        .global-access { font-style: italic; color: var(--ink-soft); opacity: 0.6; }

        .btn-icon-danger { background: transparent; border: none; color: var(--danger); opacity: 0.65; cursor: pointer; transition: all 0.16s; padding: 7px; border-radius: 8px; }
        .btn-icon-danger:hover { opacity: 1; background: #fff5f5; }

        .btn-icon-warning { background: transparent; border: none; color: var(--gold); opacity: 0.7; cursor: pointer; transition: all 0.16s; padding: 7px; border-radius: 8px; }
        .btn-icon-warning:hover { opacity: 1; background: #fffdf5; }

        .empty-row { text-align: center; padding: 48px !important; color: var(--ink-soft); font-style: italic; }

        .modal-info-text { font-size: 0.9rem; color: var(--ink-soft); margin-bottom: 20px; line-height: 1.5; }

        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(26, 61, 51, 0.45); backdrop-filter: blur(6px); display: none; align-items: center; justify-content: center; z-index: 2000; padding: 24px; }
        .modal-overlay.active { display: flex; }
        .modal-content { width: 100%; max-width: 500px; padding: 28px; border-radius: 18px; background: var(--paper); box-shadow: 0 20px 50px rgba(26, 61, 51, 0.18); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .header-title { display: flex; align-items: center; gap: 10px; }
        .header-title h2 { font-size: 1.2rem; font-weight: 700; margin: 0; }
        .close-btn { background: transparent; border: none; color: var(--ink-soft); cursor: pointer; }

        .create-user-form { display: flex; flex-direction: column; gap: 18px; }
        .form-section { display: flex; flex-direction: column; gap: 6px; }
        .m-label { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--ink-soft); letter-spacing: 0.5px; }
        
        .input-wrapper-glass { position: relative; display: flex; align-items: center; }
        .input-wrapper-glass svg { position: absolute; left: 14px; color: var(--ink-soft); opacity: 0.6; }
        .input-wrapper-glass input, .input-wrapper-glass select { width: 100%; padding: 12px 12px 12px 42px; border-radius: 10px; border: 1px solid #d5d0c3; background: white; font-weight: 600; outline: none; }
        
        .role-selector { display: flex; gap: 12px; }
        .role-btn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px; border-radius: 12px; border: 1px solid #d5d0c3; background: white; cursor: pointer; transition: all 0.16s; }
        .role-btn span { font-size: 0.82rem; font-weight: 700; }
        .role-btn.active { border: 2px solid var(--sidebar-bg, #095c7b); background: rgba(9, 92, 123, 0.06); color: var(--sidebar-bg, #095c7b); }

        .modal-actions { display: flex; gap: 12px; margin-top: 8px; }
        .btn-secondary-glass { flex: 1; padding: 12px; border-radius: 10px; border: 1px solid #d5d0c3; background: white; font-weight: 700; cursor: pointer; }
        .btn-primary-glass { flex: 1; padding: 12px; border-radius: 10px; border: none; background: var(--sidebar-bg, #095c7b); color: white; font-weight: 700; cursor: pointer; }

        .fade-in { animation: fadeIn 0.22s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

        @media (max-width: 768px) {
          .users-table th:nth-child(3), .users-table td:nth-child(3) { display: none; }
          .page-header { flex-direction: column; align-items: flex-start; }
          .header-right { width: 100%; }
          .um-tabs { width: 100%; display: grid; grid-template-columns: 1fr 1fr; }
          .um-tab { justify-content: center; }
        }
      `}</style>
    </div>
  );
};

export default UserManagement;
