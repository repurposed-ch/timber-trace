import { Bounds, Edges, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { createWoodMaterial, updateWoodMaterial } from "../materials/wood";

/** shown when a dimension is unknown, in mm */
export const DEFAULT_DIMS = { length: 4000, width: 120, height: 240 };

type Dim = { status: string; value?: number };

export function beamShape(record: any) {
  const dims = record?.dimensions ?? {};
  const pick = (k: keyof typeof DEFAULT_DIMS) => {
    const d: Dim | undefined = dims[k];
    return d?.status === "known" && d.value! > 0 ? { mm: d.value!, known: true } : { mm: DEFAULT_DIMS[k], known: false };
  };
  const length = pick("length");
  const width = pick("width");
  const height = pick("height");
  const product = record?.product?.kind === "known" ? record.product.value : "custom";
  return {
    size: [length.mm / 1000, height.mm / 1000, width.mm / 1000] as [number, number, number],
    allKnown: length.known && width.known && height.known,
    species: record?.species ?? "unknown",
    product,
    seed: ((record?.id?.[0] ?? 0) / 2 ** 32) * 97,
  };
}

function Beam({ record }: { record: any }) {
  const shape = beamShape(record);
  const [l, h, w] = shape.size;
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
    <mesh geometry={geometry} material={material}>
      <Edges threshold={20} color={shape.allKnown ? "#5b4632" : "#8a5a2b"} lineWidth={shape.allKnown ? 1 : 1.5} />
    </mesh>
  );
}

export function BeamViewer({ record }: { record: any }) {
  const { t } = useTranslation();
  const shape = beamShape(record);
  const fitKey = shape.size.join("x");
  return (
    <div className="viewer">
      <Canvas camera={{ position: [1.6, 1.1, 2.4], fov: 35, near: 0.01, far: 200 }} gl={{ preserveDrawingBuffer: true, antialias: true }} dpr={[1, 2]}>
        <color attach="background" args={["#efece6"]} />
        <Bounds key={fitKey} fit clip margin={0.75}>
          <Beam record={record} />
        </Bounds>
        <OrbitControls makeDefault enableDamping />
      </Canvas>
      {!shape.allKnown && <p className="badge">{t("viewer.unknownDims")}</p>}
    </div>
  );
}
