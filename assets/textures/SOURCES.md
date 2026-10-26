# Planet imagery used by ASTRA LAB 2.0

All maps are equirectangular (longitude -180..180, north at the top) and were resized for the app. They are visual only and never used by the physics.

| File | What | Origin |
|---|---|---|
| earth-color.jpg | Earth colour, cloud-free | NASA Blue Marble (NASA Earth Observatory, public domain), as distributed in the examples of the `three-globe` npm package (MIT) |
| earth-night.jpg | City lights | NASA Black Marble / Earth at Night (public domain), same package |
| earth-water.png | Ocean mask (white = water) | `three-globe` examples, derived from NASA data |
| earth-height.png | Relief (grey) | `three-globe` examples (earth-topology), derived from NASA elevation data |
| moon-color.jpg | Moon colour | Lunar Reconnaissance Orbiter global mosaic (NASA/GSFC/ASU), as distributed in the examples of the `globe.gl` npm package (MIT) |
| moon-height.jpg | Moon relief (grey) | `globe.gl` examples (lunar bump map) |

Mars still uses the generated texture. To switch the imagery off: `localStorage.setItem('astra.photoTex', '0')` in the developer console.

## Added in 2.4

| File | What | Origin |
|---|---|---|
| earth-color-4k.jpg | Earth colour, 4096 x 2048 | NASA Blue Marble (public domain), as bundled in the `earth-visualization` npm package (MIT) |
| earth-clouds.jpg | Real cloud cover (grey), 4096 x 2048 | NASA satellite cloud composite (public domain), same package |
| earth-height-2k.png | Relief, 2048 x 1024 | NASA elevation data, same package |
| earth-water-2k.png | Ocean mask, 2048 x 1024 | NASA land/ocean data, same package |

The app uses these at "high" and "medium" graphics quality; the older, smaller files stay as the fallback.
