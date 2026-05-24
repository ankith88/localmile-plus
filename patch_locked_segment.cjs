const fs = require('fs');
const file = 'src/pages/Jobs/NewJobForm.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldHtml = `                        {/* FROM SECTION */}
                        <div className={\`route-segment \${independentServiceType === 'outbound' ? 'locked-segment dark-theme' : 'active-segment elevated'}\`}>
                          <label className="route-label">PICKUP FROM</label>
                          <div className="address-header">
                            <MapPin size={16} />
                            <span>{\`\${independentServiceType === 'outbound' ? 'Your Site Address' : 'Sender Address'}\`}</span>
                            {independentServiceType === 'outbound' && <Lock size={12} className="lock-icon" />}
                          </div>
                          {independentServiceType === 'outbound' ? (
                            <div className="locked-address-display">
                              <strong>{formData.customer.company}</strong>
                              <p>{formData.customer.address}, {formData.customer.suburb} {formData.customer.state} {formData.customer.postcode}</p>
                            </div>
                          ) : (
                            <div className="searchable-address-area">
                              <input 
                                type="text" 
                                placeholder="Sender Company Name"
                                className="transparent-input company"
                                value={recipientData.company}
                                onChange={(e) => setRecipientData({...recipientData, company: e.target.value})}
                              />
                              <div className="search-input-wrapper">
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
                            </div>
                          )}
                        </div>

                        {/* SWAP BUTTON */}
                        <div className="swap-button-container">
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
                        </div>

                        {/* TO SECTION */}
                        <div className={\`route-segment \${independentServiceType === 'inbound' ? 'locked-segment dark-theme' : 'active-segment elevated'}\`}>
                          <label className="route-label">DELIVER TO</label>
                          <div className="address-header">
                            <MapPin size={16} />
                            <span>{\`\${independentServiceType === 'inbound' ? 'Your Site Address' : 'Recipient Address'}\`}</span>
                            {independentServiceType === 'inbound' && <Lock size={12} className="lock-icon" />}
                          </div>
                          {independentServiceType === 'inbound' ? (
                            <div className="locked-address-display">
                              <strong>{formData.customer.company}</strong>
                              <p>{formData.customer.address}, {formData.customer.suburb} {formData.customer.state} {formData.customer.postcode}</p>
                            </div>
                          ) : (
                            <div className="searchable-address-area">
                              <input 
                                type="text" 
                                placeholder="Recipient Company Name"
                                className="transparent-input company"
                                value={recipientData.company}
                                onChange={(e) => setRecipientData({...recipientData, company: e.target.value})}
                              />
                              <div className="search-input-wrapper">
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
                            </div>
                          )}
                        </div>`;

const newHtml = `                        {/* FROM SECTION */}
                        <div className={\`route-segment \${independentServiceType === 'outbound' ? 'locked-segment dark-theme' : 'active-segment elevated'}\`}>
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
                              <div className="searchable-address-area">
                                <input 
                                  type="text" 
                                  placeholder="Sender Company Name"
                                  className="transparent-input company"
                                  value={recipientData.company}
                                  onChange={(e) => setRecipientData({...recipientData, company: e.target.value})}
                                />
                                <div className="search-input-wrapper">
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
                              </div>
                            </>
                          )}
                        </div>

                        {/* SWAP BUTTON */}
                        <div className="swap-button-container">
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
                        </div>

                        {/* TO SECTION */}
                        <div className={\`route-segment \${independentServiceType === 'inbound' ? 'locked-segment dark-theme' : 'active-segment elevated'}\`}>
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
                              <div className="searchable-address-area">
                                <input 
                                  type="text" 
                                  placeholder="Recipient Company Name"
                                  className="transparent-input company"
                                  value={recipientData.company}
                                  onChange={(e) => setRecipientData({...recipientData, company: e.target.value})}
                                />
                                <div className="search-input-wrapper">
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
                              </div>
                            </>
                          )}
                        </div>`;

content = content.replace(oldHtml, newHtml);

// Append new CSS
const cssAdd = `
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
`;

content = content.replace("      `}</style>", cssAdd + "\n      `}</style>");

fs.writeFileSync(file, content);
console.log("Done");
