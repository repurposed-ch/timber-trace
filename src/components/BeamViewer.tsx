import { Bounds, Edges, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { createWoodMaterial, updateWoodMaterial } from "../materials/wood";
import { beamDims, lotOf } from "../schema/beam";
import { useThemeColors } from "../theme";

export function beamShape(record: any) {
  const { size, known } = beamDims(record);
  const product = record?.product?.kind === "known" ? record.product.value : "custom";
  return {
    size: [size.length / 1000, size.height / 1000, size.width / 1000] as [number, number, number],
    allKnown: known,
    species: record?.species ?? "unknown",
    product,
    seed: ((record?.id?.[0] ?? 0) / 2 ** 32) * 97,
  };
}

/** a lot: up to 9 pieces in a stack, lengths spread over its range, with a small gap */
export function lotLayout(record: any): { length: number; at: [number, number, number] }[] {
  const lot = lotOf(record);
  const [l, h, w] = beamShape(record).size;
  if (!lot) return [{ length: l, at: [0, 0, 0] }];
  const n = Math.min(lot.count, 9);
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const min = lot.length && lot.length.max > 0 ? lot.length.min / lot.length.max : 1;
  return Array.from({ length: n }, (_, i) => {
    const length = l * (n === 1 ? 1 : min + ((1 - min) * i) / (n - 1));
    const col = i % cols;
    const row = Math.floor(i / cols);
    // pieces start flush at one end, like a stack in a yard
    return { length, at: [(length - l) / 2, (row - (rows - 1) / 2) * h * 1.1, (col - (cols - 1) / 2) * w * 1.1] as [number, number, number] };
  });
}

function Beam({ record, edge, edgeUnknown, length, at = [0, 0, 0] }: { record: any; edge: string; edgeUnknown: string; length?: number; at?: [number, number, number] }) {
  const shape = beamShape(record);
  const [fullL, h, w] = shape.size;
  const l = length ?? fullL;
  const round = shape.product === "round";
  const geometry = useMemo(() => {
    if (!round) return new THREE.BoxGeometry(l, h, w);
    const g = new THREE.CylinderGeometry(Math.min(h, w) / 2, Math.min(h, w) / 2, l, 48);
    g.rotateZ(Math.PI / 2); // grain (cylinder axis) along x
    return g;
  }, [l, h, w, round]);
  const params = { species: shape.species, product: shape.product, size: shape.size, seed: shape.seed, opacity: shape.allKnown ? 1 : 0.6 };
  const material = useMemo(() => createWoodMaterial(params), []); // eslint-disable-line react-hooks/exhaustive-deps
  updateWoodMaterial(material, params);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh geometry={geometry} material={material} position={at}>
      <Edges threshold={20} color={shape.allKnown ? edge : edgeUnknown} lineWidth={shape.allKnown ? 1 : 1.5} />
    </mesh>
  );
}

export function BeamViewer({ record }: { record: any }) {
  const { t } = useTranslation();
  const shape = beamShape(record);
  const pieces = lotLayout(record);
  const fitKey = `${shape.size.join("x")}:${pieces.length}`;
  const colors = useThemeColors({ bg: "--viewer-bg", edge: "--edge", edgeUnknown: "--edge-unknown" });
  return (
    <div className="viewer">
      <Canvas camera={{ position: [1.6, 1.1, 2.4], fov: 35, near: 0.01, far: 200 }} gl={{ preserveDrawingBuffer: true, antialias: true }} dpr={[1, 2]}>
        <color attach="background" args={[colors.bg || "#efece6"]} />
        <Bounds key={fitKey} fit clip margin={0.75}>
          {pieces.map((p, i) => (
            <Beam key={i} record={record} length={p.length} at={p.at} edge={colors.edge || "#5b4632"} edgeUnknown={colors.edgeUnknown || "#8a5a2b"} />
          ))}
        </Bounds>
        <OrbitControls makeDefault enableDamping />
      </Canvas>
      {!shape.allKnown && <p className="badge">{t("viewer.unknownDims")}</p>}
    </div>
  );
}
