precision mediump float;

uniform sampler2D uTexture;
uniform float uOpacity;
uniform vec2 uMouseVelocity;

varying vec2 vUv;

vec2 scaleUV(vec2 uv, float scale) {
  float center = 0.5;
  return ((uv - center) * scale) + center;
}

void main() {
  vec2 uv = scaleUV(vUv, 0.9);

  // Depth parallax
  vec2 fromCenter = vUv - 0.5;
  float distFromCenter = length(fromCenter);
  float depthFactor = distFromCenter * 3.0;
  vec2 parallaxOffset = uMouseVelocity * depthFactor;
  uv -= parallaxOffset;

  // RGB shift along mouse direction
  float velocityStrength = length(uMouseVelocity);
  float rgbShift = velocityStrength * distFromCenter;
  vec2 direction = normalize(uMouseVelocity + vec2(0.3));

  float r = texture2D(uTexture, uv - direction * rgbShift * 4.5).r;
  float g = texture2D(uTexture, uv - direction * rgbShift * 2.5).g;
  float b = texture2D(uTexture, uv - direction * rgbShift * 0.5).b;

  gl_FragColor = vec4(r, g, b, uOpacity);
}
