import { useEffect, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict", fontFamily: "Manrope, \"IBM Plex Sans Hebrew\", sans-serif" });
let seq = 0;

/** Renders a Mermaid diagram. If the source doesn't parse (AI-written diagrams sometimes don't), shows it as text. */
export default function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    mermaid.render(`mmd-${++seq}`, code)
      .then((r) => alive && setSvg(r.svg))
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [code]);
  if (failed) return <pre className="ltr">{code}</pre>;
  return <div className="diagram ltr" dangerouslySetInnerHTML={{ __html: svg }} />;
}
