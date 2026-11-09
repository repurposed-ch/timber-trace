import { useTranslation } from "react-i18next";
import type { LoadedSchema } from "../schema/loader";
import { useLabels } from "../state/useSchema";

export function SchemaPage({ slug, schema }: { slug: string; schema: LoadedSchema }) {
  useTranslation(slug); // suspends until this schema's labels are fetched
  const labels = useLabels(slug, schema.meta.countryEnums);
  return (
    <section>
      <h2>{labels.raw.title ?? slug}</h2>
      <p className="muted">{labels.raw.description}</p>
    </section>
  );
}
