uniform vec2 uOffset;
uniform float uReveal;
uniform float uPageTransition;

varying vec2 vUv;

#include "../utils/includes/perlinNoise.glsl"

float M_PI = 3.1415926535897932384626433832795;

vec3 deformationCurve(vec3 position, vec2 uv, vec2 offset) {
  position.x = position.x + (sin(uv.y * M_PI) * offset.x);
  position.y = position.y - (sin(uv.x * M_PI) * offset.y);
  return position;
}

void main() {
  vUv = uv;

  vec3 newPosition = position;
  newPosition = deformationCurve(position, uv, uOffset);

  // Page transition: paper ripple + subtle noise
  if(uPageTransition > 0.01 && uPageTransition < 0.99) {
    float waveIntensity = sin(uPageTransition * M_PI);
    float easedProgress = smoothstep(0.0, 1.01, uPageTransition);

    float wavePhase = easedProgress * M_PI * 2.5;
    float rippleX = uv.x * M_PI * 1.5 + wavePhase;
    float paperRipple = sin(rippleX) * waveIntensity * 0.15;

    float noiseScale = 2.5;
    float noiseSpeed = uPageTransition * 0.3;
    float noiseZ = cnoise(vec3(uv * noiseScale, noiseSpeed)) * waveIntensity * 0.035;

    newPosition.z += -paperRipple * 1.5 + noiseZ;
  }

  // Reveal effect
  if(uReveal < 0.01) {
    newPosition *= 0.0;
  } else if(uReveal > 0.99) {
    newPosition *= 1.0;
  } else {
    float wave = sin((uv.x * M_PI)) * 0.15 * (1.0 - abs(uReveal - 0.5) * 2.0);
    float scale = uReveal + wave;
    scale = clamp(scale, 0.0, 1.0);
    newPosition *= scale;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
