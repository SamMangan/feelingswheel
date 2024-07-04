const RADIUS0 = 520;
const RADIUS1 = 355;
const RADIUS2 = 200;
const DATA_FILE = "data.json";

let colors = new Map();
let labels = new Map();
async function loadData() {
  try {
    const response = await fetch(DATA_FILE);
    const data = await response.json();

    Object.entries(data.colors).forEach(([label, color]) => colors.set(label, color));

    Object.entries(data.labels).forEach(([key, value]) => {
      const subMap = new Map();
      Object.entries(value).forEach(([subKey, subValue]) => subMap.set(subKey, subValue));
      labels.set(key, subMap);
    });

  } catch (error) { console.error("Error reading JSON file:", error); }
}

function addSVGElement(parent, tag, classes=[]) {
  let elem = document.createElementNS("http://www.w3.org/2000/svg", tag)
  elem.classList.add(...classes);
  return parent.appendChild(elem);
}

class Ring {
  constructor(id, radii, labelOffset=0) {
    this.id = id;
    this.radii = radii;
    this.labelOffset = labelOffset;

    this.elem = addSVGElement(document.querySelector("svg"), "g")
    this.elem.id = id;
    let outline = addSVGElement(this.elem, "circle", ["outline"]);
    outline.setAttribute("cx", RADIUS0)
    outline.setAttribute("cy", RADIUS0)
    outline.setAttribute("r", radii[1])
  }

  get currentSector() { return [this.prevDegrees, this.degrees]; }
  get prevDegrees() { return this._prevDegrees ?? this.degrees; }
  get degrees() { return this._degrees ?? 0; }
  set degrees(v) {
    this._prevDegrees = this.degrees;
    this._degrees = v;
  }
}

function cartesian(x, y, degrees, length = RADIUS0) {
  let radians = (degrees - 90) * Math.PI / 180;
  return {
    x: x + (length * Math.cos(radians)),
    y: y + (length * Math.sin(radians))
  };
}

function sectorPath(startDegrees, endDegrees) {
  let x = y = RADIUS0;
  let start = cartesian(x, y, endDegrees);
  let end = cartesian(x, y, startDegrees);
  let arc = `L${start.x},${start.y} A${RADIUS0} ${RADIUS0} 0 0 0 ${end.x} ${end.y}`;
  return `M${x},${y}` + arc + " z";
}

function spokePath(degrees, radius1, radius2) {
  let x = y = RADIUS0;
  let start = cartesian(x, y, degrees, radius1);
  let end = cartesian(x, y, degrees, radius2);
  return `M${start.x},${start.y} L${end.x},${end.y}`;
}

function sector(ring, sectorId, labelText) {
  let [start, end] = ring.currentSector;
  let elem = addSVGElement(ring.elem, "g", ["sector"]);
  elem.id = sectorId;

  let midline = addSVGElement(addSVGElement(elem, "defs"), "path", ["midline"]);
  midline.id = `${elem.id}-midline`;
  midline.setAttribute("d", spokePath((start + end)/2, ...ring.radii));

  let label = addSVGElement(addSVGElement(elem, "text"), "textPath", ["label"]);
  label.setAttribute("href", `#${midline.id}`)
  label.setAttribute("startOffset", `${50+ring.labelOffset}%`);
  label.textContent = labelText;

  let spoke = addSVGElement(elem, "path", ["spoke"]);
  spoke.setAttribute("d", spokePath(start, ...ring.radii));
}

function createWheel() {
  let count = m => {
    let c = 0;
    m.forEach(e => c += (e instanceof Map) ? count(e) : e.length);
    return c;
  }

  let innerRing = new Ring("inner", [0, RADIUS2], 7);
  let middleRing = new Ring("middle", [RADIUS2, RADIUS1]);
  let outerRing = new Ring("outer", [RADIUS1, RADIUS0]);

  let id = 1;
  labels.forEach((middle, label) => {
    innerRing.degrees += count(middle) * 360 / count(labels)
    sector(innerRing, `s${id++}`, label);
    middle.forEach((outer, label) => {
      middleRing.degrees += outer.length * 360 / count(labels);
      sector(middleRing, `s${id++}`, label);
      outer.forEach(label => {
        outerRing.degrees += 360 / count(labels);
        sector(outerRing, `s${id++}`, label);
      });
    });
    
    let colorSector = addSVGElement(document.querySelector("svg #color"), "path");
    colorSector.setAttribute("d", sectorPath(innerRing.prevDegrees, innerRing.degrees));
    colorSector.setAttribute("fill", colors.get(label) ?? "black");
  });
}

document.addEventListener("DOMContentLoaded", async function () {
  const svg = document.querySelector('svg');
  svg.setAttribute('viewBox', `0 0 ${RADIUS0*2} ${RADIUS0*2}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  
  await loadData();
  createWheel();

  svg.classList.add('rotatable');
  addRotationHandler(svg, svg.parentElement);
});

function addRotationHandler(svg, container) {
  let isDragging = false;
  let previousAngle = 0;
  let currentRotation = 0;
  let velocity = 0;
  let animationFrame;

  function getAngle(event) {
    const rect = svg.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  }

  function rotateSvg(angle) {
    svg.style.transform = `rotate(${angle}deg)`;
  }

  function startDrag(event) {
    isDragging = true;
    previousAngle = getAngle(event);
    velocity = 0;
    cancelAnimationFrame(animationFrame);
    svg.style.animation = 'none'; // Disable initial animation on user interaction
  }

  function drag(event) {
    if (!isDragging)
      return;
    event.preventDefault();
    const currentAngle = getAngle(event);
    const deltaAngle = currentAngle - previousAngle;
    previousAngle = currentAngle;
    currentRotation += deltaAngle;
    rotateSvg(currentRotation);
    velocity = deltaAngle;
  }

  function endDrag() {
    isDragging = false;
    animateInertia();
  }

  function animateInertia() {
    if (Math.abs(velocity) < 0.1) {
      cancelAnimationFrame(animationFrame);
      return;
    }
    currentRotation += velocity;
    rotateSvg(currentRotation);
    velocity *= 0.95; // Inertia decay factor
    animationFrame = requestAnimationFrame(animateInertia);
  }

  container.addEventListener('mousedown', startDrag);
  container.addEventListener('mousemove', drag);
  container.addEventListener('mouseup', endDrag);
  container.addEventListener('mouseleave', endDrag);
  container.addEventListener('touchstart', startDrag);
  container.addEventListener('touchmove', drag);
  container.addEventListener('touchend', endDrag);
  container.addEventListener('touchcancel', endDrag);
}
