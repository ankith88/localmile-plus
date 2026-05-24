const fs = require('fs');
const file = 'src/pages/Jobs/NewJobForm.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add ArrowDownUp to imports
content = content.replace(/Truck,/g, "Truck,\n  ArrowDownUp,");

// 2. Replace the HTML structure
const startTag = "{/* Service Selection for Customers */}";
const endTag = "</div>\n                      </div>\n\n                      {addressPredictions.length > 0 && (";
const startIndex = content.indexOf(startTag);
const endIndex = content.indexOf(endTag) + "</div>\n                      </div>".length;

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find bounds");
    process.exit(1);
}

const newHtml = `
                      <div className="unified-route-card">
                        {/* FROM SECTION */}
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
                        </div>
                      </div>
`;

content = content.substring(0, startIndex) + newHtml.trim() + "\n" + content.substring(endIndex);

// 3. Add CSS
const cssIndex = content.lastIndexOf("</style>");
if (cssIndex === -1) {
    console.error("Could not find style tag");
    process.exit(1);
}

const cssAdd = `
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
        
        .address-header { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.85rem; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 8px; }
        .locked-address-display strong { font-size: 1.2rem; display: block; margin-bottom: 4px; }
        .locked-address-display p { font-size: 0.9rem; opacity: 0.8; margin: 0; }
        
        .transparent-input { background: transparent; border: none; width: 100%; font-size: 1rem; color: inherit; outline: none; }
        .transparent-input.company { font-size: 1.2rem; font-weight: 800; margin-bottom: 8px; }
        .transparent-input.address { font-size: 0.9rem; opacity: 0.8; }
        .search-input-wrapper { display: flex; align-items: center; background: rgba(0,0,0,0.03); padding: 8px 12px; border-radius: 8px; }
        .dark-theme .transparent-input { color: white; }
        .dark-theme .transparent-input::placeholder { color: rgba(255,255,255,0.5); }
`;

content = content.substring(0, cssIndex) + cssAdd + content.substring(cssIndex);

fs.writeFileSync(file, content);
console.log("Done");
