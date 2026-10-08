"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { transform, type MotionValue } from "framer-motion";
import * as THREE from "three";

// 3D model of the Toss basket box, built to the printed part's proportions (square, about a third as tall as
// it is wide, inset lid with a groove and edge notches, centre screw) plus a USB-C port and status LED on one
// side. The scroll progress of the showcase section drives everything: rotation, sliding side to side, and
// the false plate and laundry basket that come down over it. No textures are downloaded: the print finish is
// generated on a canvas, and lighting comes from built-in light panels (no remote HDR).

const W = 1; // box side (≈ 11 cm)
const H = 0.3; // body height
const ease = (t: number) => t * t * (3 - 2 * t);

function canvasTexture(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 256, repeat = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

// layer lines on the walls, the textured build-plate grain on the lid
const layerLines = () =>
  canvasTexture((g, s) => {
    g.fillStyle = "#808080";
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 4) {
      g.fillStyle = y % 8 === 0 ? "#8c8c8c" : "#747474";
      g.fillRect(0, y, s, 2);
    }
  }, 256, 2);
const grain = () =>
  canvasTexture((g, s) => {
    const img = g.createImageData(s, s);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + Math.random() * 60;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, 256, 3);
// perforated hamper wall (alpha map: white = solid, black = hole)
const holes = () =>
  canvasTexture((g, s) => {
    g.fillStyle = "#fff";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "#000";
    for (let y = 18; y < s; y += 36)
      for (let x = 18 + ((y / 36) % 2) * 18; x < s; x += 36) {
        g.beginPath();
        g.ellipse(x, y, 9, 13, 0, 0, Math.PI * 2);
        g.fill();
      }
  }, 256, 4);

// keyframes over the section's scroll progress
const rotY = transform([0, 0.16, 0.34, 0.46, 0.54, 0.64, 0.78, 1], [-0.62, 0.35, 2.3, 4.55, 4.71, 5.95, 6.6, 7.1]);
const posX = transform([0, 0.14, 0.24, 0.37, 0.55, 0.62, 0.78, 1], [0.8, 0.8, 0.9, -0.42, -0.42, 0.75, 0.8, 0.8]);
const tilt = transform([0, 0.14, 0.4, 0.47, 0.55, 0.62, 1], [0.32, 0.36, 0.2, 0.1, 0.1, 0.34, 0.4]);
const zoom = transform([0, 0.14, 0.4, 0.5, 0.62, 0.78, 1], [1, 1, 1.1, 1.12, 0.72, 0.72, 0.72]);
const plateY = transform([0.56, 0.66], [2.2, H + 0.06]);
const hamperY = transform([0.6, 0.72], [2.6, 0]);
const hamperFade = transform([0.58, 0.66, 0.82, 1], [0, 1, 0.45, 0.35]);
const portGlow = transform([0.42, 0.47, 0.55, 0.6], [0, 1, 1, 0]);

// A pose set from outside (the order form's viewer): rotation and tilt, no scroll story.
export type Pose = { ry: number; t: number };

function Box({ color, progress, pose }: { color: string; progress?: MotionValue<number>; pose?: React.RefObject<Pose> }) {
  const group = useRef<THREE.Group>(null);
  const plate = useRef<THREE.Mesh>(null);
  const hamper = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => ({ lines: layerLines(), grain: grain(), holes: holes() }), []);
  const body = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.84, metalness: 0, bumpMap: tex.lines, bumpScale: 0.6 }), [tex]);
  const lid = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, bumpMap: tex.grain, bumpScale: 0.9 }), [tex]);
  const target = useMemo(() => new THREE.Color(color), [color]);
  const smooth = useRef({ ry: rotY(0), x: 0, t: 0.32, s: 1, py: 2.2, hy: 2.6, hf: 0, g: 0 });
  // on narrow screens the stage is only the top half: keep the box centred instead of sliding
  const wide = useThree((st) => st.size.width >= 900);

  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.0008, dt); // frame-rate independent smoothing
    const s = smooth.current;
    if (pose?.current) {
      // viewer: just the box, turned to the requested pose
      s.ry += (pose.current.ry - s.ry) * k;
      s.t += (pose.current.t - s.t) * k;
      s.x += (0 - s.x) * k;
      s.s += (1 - s.s) * k;
      s.hf = 0;
      s.g = 0;
    } else {
      const p = progress?.get() ?? 0;
      s.ry += (rotY(p) - s.ry) * k;
      s.x += ((wide ? posX(p) : 0) - s.x) * k;
      s.t += (tilt(p) - s.t) * k;
      s.s += (zoom(p) - s.s) * k;
      s.py += (plateY(p) - s.py) * k;
      s.hy += (hamperY(p) - s.hy) * k;
      s.hf += (hamperFade(p) - s.hf) * k;
      s.g += (portGlow(p) - s.g) * k;
    }
    const g = group.current!;
    g.rotation.set(s.t, s.ry, 0);
    g.position.x = s.x;
    g.scale.setScalar(s.s);
    if (plate.current) {
      plate.current.position.y = s.py;
      (plate.current.material as THREE.MeshStandardMaterial).opacity = ease(Math.min(1, s.hf * 1.2)) * 0.92;
    }
    if (hamper.current) {
      hamper.current.position.y = s.hy;
      hamper.current.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && "opacity" in m) m.opacity = s.hf * 0.55;
      });
      hamper.current.visible = s.hf > 0.01;
    }
    if (glow.current) (glow.current.material as THREE.MeshBasicMaterial).opacity = s.g * 0.4;
    body.color.lerp(target, k);
    lid.color.lerp(target, k);
  });

  const dark = <meshStandardMaterial color="#060607" roughness={0.6} />;
  const notch = (x: number, z: number, rot: number, key: string) => (
    <mesh key={key} position={[x, H + 0.004, z]} rotation={[0, rot, 0]}>
      <boxGeometry args={[0.07, 0.012, 0.03]} />
      {dark}
    </mesh>
  );
  const e = W / 2 - 0.045;

  return (
    <group ref={group}>
      <group position={[0, -H / 2, 0]}>
        {/* body */}
        <RoundedBox args={[W, H, W]} radius={0.022} smoothness={4} position={[0, H / 2, 0]} material={body} />
        {/* groove around the lid, then the lid itself */}
        <mesh position={[0, H + 0.002, 0]}>
          <boxGeometry args={[W - 0.06, 0.006, W - 0.06]} />
          {dark}
        </mesh>
        <RoundedBox args={[W - 0.1, 0.028, W - 0.1]} radius={0.006} smoothness={2} position={[0, H + 0.016, 0]} material={lid} />
        {[notch(-0.22, e, 0, "a"), notch(0.22, e, 0, "b"), notch(-0.22, -e, 0, "c"), notch(0.22, -e, 0, "d"), notch(e, -0.22, Math.PI / 2, "e"), notch(e, 0.22, Math.PI / 2, "f"), notch(-e, -0.22, Math.PI / 2, "g"), notch(-e, 0.22, Math.PI / 2, "h")]}
        {/* centre screw */}
        <mesh position={[0, H + 0.034, 0]}>
          <cylinderGeometry args={[0.024, 0.026, 0.01, 32]} />
          <meshStandardMaterial color="#c9ccd2" metalness={1} roughness={0.28} />
        </mesh>
        <mesh position={[0, H + 0.04, 0]}>
          <boxGeometry args={[0.032, 0.003, 0.006]} />
          {dark}
        </mesh>
        <mesh position={[0, H + 0.04, 0]} rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[0.032, 0.003, 0.006]} />
          {dark}
        </mesh>
        {/* USB-C port + status LED on the +X side */}
        <RoundedBox args={[0.014, 0.034, 0.1]} radius={0.0068} smoothness={3} position={[W / 2 - 0.004, H * 0.42, 0]}>
          <meshStandardMaterial color="#050506" roughness={0.5} />
        </RoundedBox>
        <mesh position={[W / 2 + 0.003, H * 0.42, 0]}>
          <boxGeometry args={[0.004, 0.009, 0.062]} />
          <meshStandardMaterial color="#3a3d44" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[W / 2 + 0.002, H * 0.42, 0.095]}>
          <sphereGeometry args={[0.007, 16, 16]} />
          <meshStandardMaterial color="#2ef08a" emissive="#2ef08a" emissiveIntensity={2.2} />
        </mesh>
        <mesh ref={glow} position={[W / 2 + 0.008, H * 0.42, 0]} rotation={[0, Math.PI / 2, 0]}>
          <ringGeometry args={[0.065, 0.085, 48]} />
          <meshBasicMaterial color="#4f8dff" transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {/* false plate that rests on the lid */}
      <mesh ref={plate} position={[0, 2.2, 0]}>
        <boxGeometry args={[1.3, 0.03, 1.3]} />
        <meshStandardMaterial color="#d9dde6" roughness={0.7} transparent opacity={0} />
      </mesh>

      {/* laundry basket around both: four perforated walls and a floor */}
      <group ref={hamper} position={[0, 2.6, 0]} visible={false}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, (i * Math.PI) / 2, 0]} position={[Math.sin((i * Math.PI) / 2) * 0.78, 0.45, Math.cos((i * Math.PI) / 2) * 0.78]}>
            <planeGeometry args={[1.56, 1.05]} />
            <meshStandardMaterial color="#eef1f7" roughness={0.6} transparent opacity={0} alphaMap={tex.holes} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        ))}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.16, 0]}>
          <planeGeometry args={[1.56, 1.56]} />
          <meshStandardMaterial color="#eef1f7" roughness={0.6} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

// Compiles every shader in the scene in the background (KHR_parallel_shader_compile where the browser has it)
// before the first frame. Without this the first render compiled them synchronously, and three's error check
// (getProgramInfoLog) blocked the page for up to ~2 s right as you started scrolling.
function Warmup({ onReady }: { onReady: () => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let live = true;
    const done = () => live && onReady();
    gl.compileAsync(scene, camera).then(done, done);
    return () => {
      live = false;
    };
  }, [gl, scene, camera, onReady]);
  return null;
}

export default function BasketScene({
  color,
  progress,
  pose,
  active,
  near = false,
  shadow = true,
}: {
  color: string;
  progress?: MotionValue<number>;
  pose?: React.RefObject<Pose>;
  active: boolean;
  /** closer camera for the smaller viewer in the order form */
  near?: boolean;
  /** the soft floor shadow (off when capturing frames for phones, which draw their own) */
  shadow?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <Canvas
      // nothing draws until the shaders are compiled; then the canvas fades in
      frameloop={ready && active ? "always" : "never"}
      style={{ opacity: ready ? 1 : 0, transition: "opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
      dpr={[1, 1.75]}
      camera={{ position: near ? [0, 0.75, 2.5] : [0, 0.9, 3.1], fov: 34 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(0, 0.05, 0);
        // don't ask the driver for shader logs: each query waits for that shader to finish compiling
        gl.debug.checkShaderErrors = false;
      }}
      aria-hidden
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[2.5, 3.5, 2.5]} intensity={1.6} />
      <directionalLight position={[-3, 1.5, -1]} intensity={0.5} />
      {/* back rim light: outlines the edges so a black print still reads on a dark page */}
      <directionalLight position={[0, 2.2, -3.5]} intensity={1.4} />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2.2} position={[0, 4, 2]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={1} position={[-4, 1, 0]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={1} position={[4, 1, 0]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} />
      </Environment>
      <Box color={color} progress={progress} pose={pose} />
      {shadow && <ContactShadows position={[0, -0.2, 0]} opacity={0.42} scale={5} blur={2.6} far={1.6} resolution={512} />}
      <Warmup onReady={onReady} />
    </Canvas>
  );
}
