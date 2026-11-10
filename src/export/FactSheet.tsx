// Loaded on demand (dynamic import) so the PDF library stays out of the main bundle.
import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { Fact } from "./facts";

export type FactSheetInput = {
  /** beam name, e.g. "Norway spruce · Glulam" */
  name: string;
  idHex: string;
  facts: Fact[];
  /** PNG data URLs */
  qr: string;
  snapshot: string | null;
  qrContent: string;
  link: string;
  /** already translated */
  text: { title: string; scan: string; schema: string; created: string; unknownDims: string | null; site: string; provenance: string | null };
};

const c = { fg: "#1d1b18", muted: "#6b665e", line: "#d8d3ca", accent: "#8a5a2b", bg: "#f6f4f0" };

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: c.fg, padding: 36 },
  bar: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: c.line, paddingBottom: 6, marginBottom: 14 },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  muted: { color: c.muted },
  name: { fontFamily: "Helvetica-Bold", fontSize: 18, marginBottom: 3 },
  id: { fontFamily: "Courier", fontSize: 9, color: c.muted, marginBottom: 6 },
  prov: { fontSize: 8.5, color: c.fg, marginBottom: 14, paddingVertical: 4, paddingHorizontal: 6, backgroundColor: c.bg, borderRadius: 3 },
  top: { flexDirection: "row", gap: 16, marginBottom: 16 },
  snapshot: { flexGrow: 1, flexBasis: 0, height: 170, objectFit: "contain", backgroundColor: "#efece6", borderRadius: 4 },
  noSnapshot: { flexGrow: 1, flexBasis: 0, height: 170, backgroundColor: "#efece6", borderRadius: 4 },
  qrBox: { width: 150, alignItems: "center" },
  qr: { width: 150, height: 150 },
  caption: { fontSize: 7.5, color: c.muted, textAlign: "center", marginTop: 4 },
  warn: { fontSize: 8, color: c.accent, marginTop: -10, marginBottom: 12 },
  group: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginTop: 8, marginBottom: 2, color: c.accent },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: c.line, paddingVertical: 3 },
  label: { width: 150, color: c.muted },
  value: { flexGrow: 1, flexBasis: 0 },
  footer: { position: "absolute", left: 36, right: 36, bottom: 24, borderTopWidth: 0.5, borderTopColor: c.line, paddingTop: 6 },
  mono: { fontFamily: "Courier", fontSize: 7 },
});

function Facts({ facts }: { facts: Fact[] }) {
  let lastGroup: string | undefined;
  return (
    <View>
      {facts.map((f) => {
        const header = f.group && f.group !== lastGroup ? <Text style={s.group}>{f.group}</Text> : null;
        // a gap after a group, so the next ungrouped row doesn't read as part of it
        const leavesGroup = !f.group && lastGroup !== undefined;
        lastGroup = f.group;
        return (
          <View key={f.path} wrap={false} style={leavesGroup ? { marginTop: 10 } : undefined}>
            {header}
            <View style={s.row}>
              <Text style={s.label}>{f.label}</Text>
              <Text style={s.value}>{f.value}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function FactSheet({ input }: { input: FactSheetInput }) {
  const { text } = input;
  return (
    <Document title={`${input.name} – ${input.idHex}`} author="Timber Trace" creator="timber-trace" producer="timber-trace">
      <Page size="A4" style={s.page}>
        <View style={s.bar} fixed>
          <Text style={s.brand}>Timber Trace</Text>
          <Text style={s.muted}>{text.title}</Text>
        </View>
        <Text style={s.name}>{input.name}</Text>
        <Text style={s.id}>{input.idHex}</Text>
        {text.provenance && <Text style={s.prov}>{text.provenance}</Text>}
        <View style={s.top}>
          {input.snapshot ? <Image src={input.snapshot} style={s.snapshot} /> : <View style={s.noSnapshot} />}
          <View style={s.qrBox}>
            <Image src={input.qr} style={s.qr} />
            <Text style={s.caption}>{text.scan}</Text>
          </View>
        </View>
        {text.unknownDims && <Text style={s.warn}>{text.unknownDims}</Text>}
        <Facts facts={input.facts} />
        <View style={s.footer} fixed>
          <Text style={s.muted}>
            {text.schema} · {text.created}
          </Text>
          <Text style={[s.mono, s.muted]}>{input.link}</Text>
        </View>
      </Page>
    </Document>
  );
}

export function buildFactSheet(input: FactSheetInput): Promise<Blob> {
  return pdf(<FactSheet input={input} />).toBlob();
}
