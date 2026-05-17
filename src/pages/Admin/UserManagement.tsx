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
  Edit2
} from 'lucide-react';
import { collection, query, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase/config';
import { useLpo } from '../../context/LpoContext';
import LoadingScreen from '../../components/LoadingScreen';

interface UserRecord {
  uid: string;
  email: string;
  role: string;
  parent_id: string;
  lpoName?: string;
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
  
  const isSuperAdmin = userData?.role === 'superadmin' || userData?.uid === 'lwOQ8j5MSIdOiyR0VZ1zEvfpx7A3';

  // New User Form State
  const [newUser, setNewUser] = useState({
    email: '',
    role: 'operator',
    parent_id: '',
    password: ''
  });

  // Reset Password State
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Edit User State
  const [editTarget, setEditTarget] = useState<UserRecord | null>(null);
  const [editEmail, setEditEmail] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'));
      const snapshot = await getDocs(q);
      const userList = snapshot.docs.map(doc => {
        const data = doc.data();
        const parent = allParents.find(l => l.id === data.parent_id);
        return {
          uid: doc.id,
          email: data.email,
          role: data.role,
          parent_id: data.parent_id,
          lpoName: parent?.name || 'N/A'
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
    }
  }, [isAdmin, allParents]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.email || !newUser.password || (newUser.role === 'operator' && !newUser.parent_id)) {
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
        alert("User account created successfully.");
      } else {
        // Fallback for regular admins (legacy behavior)
        alert("Only Super Admins can create auth-enabled user accounts currently.");
        setIsSubmitting(false);
        return;
      }

      setIsModalOpen(false);
      setNewUser({ email: '', role: 'operator', parent_id: '', password: '' });
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

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.lpoName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="user-mgmt-premium">
      <div className="mesh-bg">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
      </div>

      <div className="content-container">
        <header className="page-header">
          <div className="header-left">
            <div className="title-area">
              <Users className="header-icon" />
              <div>
                <h1>User Management</h1>
                <p>Manage application access for Head Office and Parent personnel.</p>
              </div>
            </div>
          </div>
          <div className="header-right">
            <button onClick={() => setIsModalOpen(true)} className="btn-premium-action">
              <UserPlus size={20} />
              <span>CREATE NEW USER</span>
            </button>
          </div>
        </header>

        <div className="glass-card filter-bar">
          <div className="search-pill">
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Search by email or Parent..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <LoadingScreen fullScreen={false} message="Syncing User Directory" />
        ) : (
          <div className="users-table-container glass-card">
            <table className="users-table">
              <thead>
                <tr>
                  <th>User Details</th>
                  <th>Role</th>
                  <th>Assigned Parent</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.uid}>
                    <td>
                      <div className="user-cell">
                        <div className={`user-avatar ${u.role}`}>
                          {u.email[0].toUpperCase()}
                        </div>
                        <div className="user-info">
                          <span className="user-email">{u.email}</span>
                          <span className="user-id">UID: {u.uid.substring(0, 8)}...</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className={`role-tag ${u.role}`}>
                        {(u.role === 'admin' || u.role === 'superadmin') ? <Shield size={12} /> : <Users size={12} />}
                        <span>{u.role === 'superadmin' ? 'SUPER ADMIN' : u.role.toUpperCase()}</span>
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
                    <td colSpan={4} className="empty-row">
                      No users found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
                  className={`role-btn ${newUser.role === 'operator' ? 'active' : ''}`}
                  onClick={() => setNewUser({...newUser, role: 'operator'})}
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

            {(newUser.role === 'operator') && (
              <div className="form-section fade-in">
                <label className="m-label">Assign to Parent</label>
                <div className="input-wrapper-glass">
                  <Building2 size={18} />
                  <select 
                    value={newUser.parent_id}
                    onChange={(e) => setNewUser({...newUser, parent_id: e.target.value})}
                    required={newUser.role === 'operator'}
                  >
                    <option value="">Select a Parent Account</option>
                    {allParents.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

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
        .user-mgmt-premium { min-height: 100vh; background: var(--offwhite); position: relative; overflow-x: hidden; }
        .mesh-bg { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 0; filter: blur(100px); opacity: 0.5; }
        .blob { position: absolute; border-radius: 50%; width: 600px; height: 600px; background: var(--cream-warm); }
        .blob-1 { top: -100px; right: -100px; }
        .blob-2 { bottom: -100px; left: -100px; background: var(--cream-warm); }

        .content-container { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; padding: 40px 24px 100px; }

        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
        .title-area { display: flex; gap: 20px; align-items: center; }
        .header-icon { width: 44px; height: 44px; color: var(--ink); }
        .page-header h1 { font-family: var(--font-headings); font-size: 2.2rem; font-weight: 400; color: var(--ink); margin: 0; letter-spacing: -0.025em; }
        .page-header p { margin: 4px 0 0; color: var(--ink-soft); font-size: 1rem; font-weight: 400; }

        .btn-premium-action {
          background: var(--ink); color: white; border: none; padding: 14px 28px; border-radius: 18px;
          font-weight: 800; display: flex; align-items: center; gap: 12px; cursor: pointer;
          box-shadow: 0 10px 25px rgba(26, 61, 51, 0.2); transition: all 0.3s;
        }
        .btn-premium-action:hover { transform: translateY(-4px); box-shadow: 0 15px 35px rgba(26, 61, 51, 0.25); }

        .filter-bar { margin-bottom: 24px; padding: 12px; }
        .search-pill { display: flex; align-items: center; gap: 12px; background: white; padding: 0 20px; border-radius: 14px; max-width: 400px; }
        .search-pill input { border: none; background: transparent; padding: 14px 0; width: 100%; font-weight: 500; outline: none; }

        .users-table-container { padding: 0; overflow: hidden; }
        .users-table { width: 100%; border-collapse: collapse; }
        .users-table th { text-align: left; padding: 20px 24px; font-family: var(--font-ui); font-size: 0.65rem; font-weight: 700; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.1em; border-bottom: 1px solid rgba(0,0,0,0.05); }
        .users-table td { padding: 20px 24px; border-bottom: 1px solid rgba(0,0,0,0.03); }
        .text-right { text-align: right !important; }

        .user-cell { display: flex; align-items: center; gap: 16px; }
        .user-avatar { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: white; background: var(--ink-soft); }
        .user-avatar.superadmin { background: #1a1a1a; box-shadow: 0 0 15px rgba(0,0,0,0.2); }
        .user-avatar.admin { background: var(--ink); }
        .user-avatar.operator { background: var(--gold); }
        
        .user-info { display: flex; flex-direction: column; }
        .user-email { font-weight: 700; color: var(--ink); font-size: 0.95rem; }
        .user-id { font-size: 0.7rem; color: var(--ink-soft); opacity: 0.6; }

        .role-tag { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 8px; font-size: 0.7rem; font-weight: 800; }
        .role-tag.superadmin { background: #000; color: #fff; }
        .role-tag.admin { background: #e8f0fe; color: #1a73e8; }
        .role-tag.operator { background: #fff4e5; color: #d97706; }

        .lpo-cell { display: flex; align-items: center; gap: 8px; color: var(--ink-soft); font-weight: 600; font-size: 0.9rem; }
        .global-access { font-style: italic; color: var(--ink-soft); opacity: 0.5; }

        .btn-icon-danger { background: transparent; border: none; color: var(--danger); opacity: 0.5; cursor: pointer; transition: all 0.2s; padding: 8px; border-radius: 8px; }
        .btn-icon-danger:hover { opacity: 1; background: #fff5f5; }

        .btn-icon-warning { background: transparent; border: none; color: var(--gold); opacity: 0.5; cursor: pointer; transition: all 0.2s; padding: 8px; border-radius: 8px; }
        .btn-icon-warning:hover { opacity: 1; background: #fffdf5; }

        .empty-row { text-align: center; padding: 60px !important; color: var(--ink-soft); font-style: italic; }

        .modal-info-text { font-size: 0.9rem; color: var(--ink-soft); margin-bottom: 24px; line-height: 1.5; }

        /* Modal Redesign */
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(26, 61, 51, 0.4); backdrop-filter: blur(8px); display: none; align-items: center; justify-content: center; z-index: 2000; padding: 24px; }
        .modal-overlay.active { display: flex; }
        .modal-content { width: 100%; max-width: 500px; padding: 32px; border-radius: 24px; background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(15px); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .header-title { display: flex; align-items: center; gap: 12px; }
        .header-title h2 { font-size: 1.25rem; font-weight: 800; margin: 0; }
        .close-btn { background: transparent; border: none; color: var(--ink-soft); cursor: pointer; }

        .create-user-form { display: flex; flex-direction: column; gap: 24px; }
        .form-section { display: flex; flex-direction: column; gap: 8px; }
        .m-label { font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: var(--ink-soft); letter-spacing: 0.5px; }
        
        .input-wrapper-glass { position: relative; display: flex; align-items: center; }
        .input-wrapper-glass svg { position: absolute; left: 16px; color: var(--ink-soft); opacity: 0.5; }
        .input-wrapper-glass input, .input-wrapper-glass select { width: 100%; padding: 14px 14px 14px 48px; border-radius: 14px; border: 1px solid rgba(0,0,0,0.05); background: white; font-weight: 600; outline: none; }
        
        .role-selector { display: flex; gap: 12px; }
        .role-btn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px; border-radius: 16px; border: 1px solid rgba(0,0,0,0.05); background: white; cursor: pointer; transition: all 0.2s; }
        .role-btn span { font-size: 0.8rem; font-weight: 800; }
        .role-btn.active { border-color: var(--ink); background: var(--offwhite); color: var(--ink); }
        .role-btn.active svg { color: var(--ink); }

        .modal-actions { display: flex; gap: 12px; margin-top: 12px; }
        .btn-secondary-glass { flex: 1; padding: 14px; border-radius: 14px; border: 1px solid rgba(0,0,0,0.05); background: white; font-weight: 700; cursor: pointer; }
        .btn-primary-glass { flex: 1; padding: 14px; border-radius: 14px; border: none; background: var(--ink); color: white; font-weight: 700; cursor: pointer; }

        .fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

        @media (max-width: 768px) {
          .users-table th:nth-child(3), .users-table td:nth-child(3) { display: none; }
          .page-header { flex-direction: column; gap: 20px; }
          .header-right { width: 100%; }
          .btn-premium-action { width: 100%; justify-content: center; }
        }
      `}</style>
    </div>
  );
};

export default UserManagement;
