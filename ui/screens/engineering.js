// Engineering Workbench screen: hosts ui/engineering/workbench.html in a frame so its styles and shortcuts stay
// separate from the rest of ASTRA LAB. The workbench runs the headless engine in src/engineering/.
export default {
  id: 'engineering', title: 'Engineering Workbench', fill: true,
  mount(el) {
    const f = document.createElement('iframe');
    f.src = 'engineering/workbench.html?embedded=1';
    f.title = 'Engineering Workbench';
    Object.assign(f.style, { width: '100%', height: '100%', border: '0', display: 'block', minHeight: '600px' });
    el.append(f);
    return () => f.remove();
  },
};
