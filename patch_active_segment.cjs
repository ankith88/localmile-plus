const fs = require('fs');
const file = 'src/pages/Jobs/NewJobForm.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace active segment CSS
const oldCss = `        .address-header { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.85rem; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 8px; }
        .locked-address-display strong { font-size: 1.2rem; display: block; margin-bottom: 4px; }
        .locked-address-display p { font-size: 0.9rem; opacity: 0.8; margin: 0; }
        
        .transparent-input { background: transparent; border: none; width: 100%; font-size: 1rem; color: inherit; outline: none; }
        .transparent-input.company { font-size: 1.2rem; font-weight: 800; margin-bottom: 8px; }
        .transparent-input.address { font-size: 0.9rem; opacity: 0.8; }
        .search-input-wrapper { display: flex; align-items: center; background: rgba(0,0,0,0.03); padding: 8px 12px; border-radius: 8px; }
        .dark-theme .transparent-input { color: white; }
        .dark-theme .transparent-input::placeholder { color: rgba(255,255,255,0.5); }`;

const newCss = `        .address-header { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.8rem; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 24px; color: var(--ink-soft); }
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
        .dark-theme .transparent-input::placeholder { color: rgba(255,255,255,0.5); }`;

content = content.replace(oldCss, newCss);

fs.writeFileSync(file, content);
console.log("Done");
