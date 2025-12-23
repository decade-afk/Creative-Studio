const fs = require('fs');
const { createCanvas } = require('canvas');

const size = 1024;
const canvas = createCanvas(size, size);
const ctx = canvas.getContext('2d');

// Create gradient background
const gradient = ctx.createLinearGradient(0, 0, size, size);
gradient.addColorStop(0, '#6B7FFF');
gradient.addColorStop(1, '#4C5FD5');

// Draw rounded rectangle
const radius = 180;
ctx.fillStyle = gradient;
ctx.beginPath();
ctx.moveTo(radius, 0);
ctx.lineTo(size - radius, 0);
ctx.quadraticCurveTo(size, 0, size, radius);
ctx.lineTo(size, size - radius);
ctx.quadraticCurveTo(size, size, size - radius, size);
ctx.lineTo(radius, size);
ctx.quadraticCurveTo(0, size, 0, size - radius);
ctx.lineTo(0, radius);
ctx.quadraticCurveTo(0, 0, radius, 0);
ctx.closePath();
ctx.fill();

// Save
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('app-icon.png', buffer);
console.log('Icon created successfully');
