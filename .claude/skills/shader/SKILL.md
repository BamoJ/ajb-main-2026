---
name: shader
description: Write and debug GLSL shaders for the WebGL system. Use when creating new shader effects, modifying vertex/fragment shaders, adding uniforms, or writing GLSL includes.
user-invocable: true
---

# Shader — GLSL Shaders in This System

## File Structure

```
src/canvas/shaders/           # Default/shared shaders
├── defaultVert.glsl           # Default vertex shader
└── defaultFrag.glsl           # Default fragment shader
src/canvas/utils/includes/     # Shared GLSL includes
└── perlinNoise.glsl           # Classic 3D Perlin noise
src/canvas/YourPage/shaders/   # Page-specific shaders (convention)
├── vertex.glsl
└── fragment.glsl
```

## Import System

Uses `vite-plugin-glsl` — import GLSL files as strings:

```js
import vertexShader from './shaders/vertex.glsl';
import fragmentShader from './shaders/fragment.glsl';
```

### `#include` Directive

Include shared GLSL from within shader files:

```glsl
#include "../utils/includes/perlinNoise.glsl"
```

Paths are relative to the including file. Processed at build time by vite-plugin-glsl.

### Adding New Includes

Create a `.glsl` file in `src/canvas/utils/includes/`:

```glsl
// src/canvas/utils/includes/yourUtil.glsl
float yourFunction(vec2 uv) {
  return smoothstep(0.0, 1.0, uv.x);
}
```

Use from any shader:
```glsl
#include "../utils/includes/yourUtil.glsl"
```

## Uniform Conventions

Standard uniforms used across the system (set by DOMPlane and TransitionController):

| Uniform | Type | Source | Purpose |
|---------|------|--------|---------|
| `uTime` | float | DOMPlane (delta * 0.001) | Accumulated time for animation |
| `uTexture` | sampler2D | TextureCache | Image texture |
| `uOpacity` | float | DOMPlane / TransitionController | Alpha control (0–1) |
| `uOffset` | vec2 | DOMPlane hover system | Mouse velocity displacement |
| `uMouseVelocity` | vec2 | DOMPlane hover system | Normalized velocity for effects |
| `uReveal` | float | Custom (HomeView) | Reveal animation progress (0–1) |
| `uHover` | float | Custom | Hover state (0–1) |
| `uWaveIntensity` | float | Custom (HomeView) | Wave effect strength |
| `uPageTransition` | float | TransitionController | Page transition progress (0–1) |

### Adding Custom Uniforms

After creating a plane via DOMPlane.createPlane():

```js
const mesh = this.createPlane(texture, el, index);
mesh.material.uniforms.uMyEffect = { value: 0.0 };
mesh.material.uniforms.uColor = { value: new THREE.Color(0xff0000) };
mesh.material.uniforms.uMouse = { value: new THREE.Vector2(0, 0) };
```

Then declare in your shader:
```glsl
uniform float uMyEffect;
uniform vec3 uColor;
uniform vec2 uMouse;
```

## Default Vertex Shader

`src/canvas/shaders/defaultVert.glsl`

**Uniforms:** uTime, uOffset (vec2), uReveal, uPageTransition
**Varying:** vUv

**Effects:**

1. **Deformation curve** — barrel-warp driven by mouse velocity:
```glsl
float deformationCurve(vec2 uv, vec2 offset) {
  // sin(uv.y * PI) * offset.x on X axis
  // sin(uv.x * PI) * offset.y on Y axis
}
```

2. **Page transition ripple** (when uPageTransition is 0.01–0.99):
- Paper ripple via `sin()` along X with wave phase
- Perlin noise Z displacement
- Intensity peaks at transition midpoint: `sin(progress * PI)`

3. **Reveal effect** (uReveal 0–1):
- Scales vertex position with sine wave modifier
- At 0: collapsed to center. At 1: full size.

## Default Fragment Shader

`src/canvas/shaders/defaultFrag.glsl`

**Uniforms:** uTexture, uOpacity, uMouseVelocity (vec2)
**Varying:** vUv

**Effects:**

1. **UV zoom** — `scaleUV(uv, 0.9)` zooms in 10% (matches `shaderZoom = 0.9` in userData for UV correction during transitions)

2. **Depth parallax** — offsets UV based on mouse velocity * distance from center * 3.0

3. **Chromatic aberration** — samples R, G, B at different UV offsets along mouse direction. Stronger at edges, scales with velocity.

4. **Final output:** `gl_FragColor = vec4(r, g, b, uOpacity)`

## Writing a New Shader

### Vertex Shader Template

```glsl
uniform float uTime;
uniform vec2 uOffset;
uniform float uReveal;

varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 pos = position;

  // Your vertex effects here
  // pos.x += ...
  // pos.y += ...
  // pos.z += ...

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

### Fragment Shader Template

```glsl
uniform sampler2D uTexture;
uniform float uOpacity;
uniform float uTime;
uniform vec2 uMouseVelocity;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;

  // Your UV effects here
  // uv += ...

  vec4 color = texture2D(uTexture, uv);

  gl_FragColor = vec4(color.rgb, color.a * uOpacity);
}
```

### Using with DOMPlane

```js
import vertexShader from './shaders/vertex.glsl';
import fragmentShader from './shaders/fragment.glsl';

class YourView extends DOMPlane {
  constructor(args) {
    super({
      ...args,
      shaders: { vertex: vertexShader, fragment: fragmentShader },
    });
  }
}
```

### Standalone ShaderMaterial (without DOMPlane)

```js
import vertexShader from './shaders/vertex.glsl';
import fragmentShader from './shaders/fragment.glsl';

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0 },
    uTexture: { value: texture },
    uOpacity: { value: 1.0 },
  },
  transparent: true,
});
```

## 60fps Rules

1. **Minimize texture lookups** — Each `texture2D()` call is expensive. The default frag does 3 (R, G, B chromatic aberration). Avoid adding more unless essential. Never sample in a loop.
2. **Use precision qualifiers** — `mediump` is sufficient for UV coordinates and colors. `lowp` for simple flags. Only use `highp` for positions and time.
```glsl
precision mediump float;  // at top of fragment shader
```
3. **Avoid branching** — `if/else` in fragment shaders kills parallelism. Use `step()`, `smoothstep()`, `mix()` instead:
```glsl
// BAD
if (uReveal > 0.5) { color = red; } else { color = blue; }
// GOOD
color = mix(blue, red, step(0.5, uReveal));
```
4. **Limit per-fragment math** — Move calculations to vertex shader when possible. Varyings interpolate for free.
5. **UV-only effects** — Distortion effects that only modify UV coordinates before a single texture lookup are much cheaper than effects that sample the texture multiple times.
6. **Geometry segments vs shader** — If you need wave/ripple, consider doing it in the vertex shader (moves vertices) rather than adding more texture samples in the fragment shader.
7. **Keep includes minimal** — Perlin noise is ~80 lines of GLSL. If you only need simple randomness, use a cheaper hash:
```glsl
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
```

## Cross-Browser

- **Safari / iOS**: WebGL 1 only on older devices. Avoid WebGL2-specific features. `texture2D` not `texture`. `gl_FragColor` not `out` variables.
- **Firefox**: Stricter GLSL validation. Always declare precision. Don't use undeclared variables even in dead code paths.
- **Mobile GPUs (Adreno, Mali)**: Very sensitive to fragment shader complexity. Keep texture samples under 4 per fragment. Avoid `pow()` — use multiplication instead.
- **All browsers**: The default shaders use WebGL1 syntax (`attribute`, `varying`, `texture2D`, `gl_FragColor`) for maximum compatibility.

## Debugging Shaders

1. **Compile errors** — Check browser console. Three.js prints the full shader source with line numbers on compile failure.
2. **Visual debugging** — Output a uniform or varying as color to see its value:
```glsl
gl_FragColor = vec4(vUv, 0.0, 1.0);  // shows UV as red-green gradient
gl_FragColor = vec4(vec3(uReveal), 1.0);  // shows reveal as grayscale
```
3. **Uniform not updating** — Check you're setting `mesh.material.uniforms.uName.value`, not `mesh.material.uniforms.uName`.
4. **Black screen** — Usually means texture didn't load. Check TextureCache, image src, CORS.

## Key Files

- `src/canvas/shaders/defaultVert.glsl` — Default vertex shader
- `src/canvas/shaders/defaultFrag.glsl` — Default fragment shader
- `src/canvas/utils/includes/perlinNoise.glsl` — Perlin noise include
- `src/canvas/DOMPlane.js` — Where ShaderMaterial is created with uniforms
