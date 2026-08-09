const fs = require('fs')
const path = require('path')

const dir = path.join(__dirname, '..', 'release', 'win-unpacked')
if (fs.existsSync(dir)) {
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('REMOVED:', dir)
}
