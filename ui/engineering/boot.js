// Entry point for workbench.html (standalone window or the Engineering screen's frame).
import { mountWorkbench } from './workbench.js';
const embedded = new URLSearchParams(location.search).has('embedded');
try { mountWorkbench(document.getElementById('root'), { embedded }); }
catch (e) { document.getElementById('root').textContent = `The engineering workbench could not start: ${e.message}`; console.error(e); }
