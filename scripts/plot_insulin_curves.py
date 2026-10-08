"""Plot saved, verified exploratory insulin-curve results; never refit models."""
import hashlib
import json
import math
from pathlib import Path
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


LABELS = {
    "shared": "Gemensam höjd och tid",
    "timing": "Separata tider",
    "amplitude": "Separata höjder",
    "both": "Separata höjder och tider, p=1",
    "shape2": "Ny kurvform, p=2",
}
COLORS = {"shared": "#777777", "timing": "#a55a16", "amplitude": "#7b5fa5",
          "both": "#287ba0", "shape2": "#19805a"}


def plot_case(case, directory):
    measured = case["hypothesisTest"]["measured"]
    external = case["hypothesisTest"]["protocol"]["id"] == "insulin-external-curve-v1"
    origin = measured["origin"]
    if origin not in (30, 60, 90):
        raise ValueError("Invalid origin")
    points = measured["plot"]["points"]
    curves = measured["plot"]["curves"]
    models = measured["scenarios"][0]["models"]
    for model, samples in zip(models, curves, strict=True):
        if samples["kind"] != model["kind"]:
            raise ValueError("Invalid curve/model mapping")
        for point in samples["points"]:
            for arm in ("unheated", "heated"):
                t, tau, A, power = point["minute"], model["tauMinutes"][arm], model["peakScale"][arm], model["shapePower"]
                expected = 0 if not t else A * (t/tau)**power * math.exp(power*(1-t/tau))
                if not math.isfinite(point[arm]) or not math.isclose(point[arm], expected, rel_tol=1e-7, abs_tol=1e-7):
                    raise ValueError("Curve samples do not match saved parameters")
    plt.rcParams.update({"font.size": 10, "svg.fonttype": "none"})
    columns = (("both", "shape2"),) if external else (("shared", "timing", "amplitude", "both"), ("both", "shape2"))
    fig, axes = plt.subplots(2, len(columns), figsize=(9 if external else 13, 9.5), sharex=True, sharey=True, squeeze=False)
    maximum = max(p[arm] for s in curves for p in s["points"] for arm in ("unheated", "heated"))
    maximum = max(maximum, max(p[arm] for p in points for arm in ("unheated", "heated")))
    for row, arm in enumerate(("unheated", "heated")):
        for col, kinds in enumerate(columns):
            ax = axes[row][col]
            ax.axvspan(origin, origin+60, color="#eef1f4", zorder=0)
            ax.axvline(origin, color="#444444", linestyle=":", linewidth=1)
            for kind in kinds:
                sample = next(s for s in curves if s["kind"] == kind)
                for future, style in ((False, "-"), (True, "--")):
                    segment = [p for p in sample["points"] if (p["minute"] >= origin if future else p["minute"] <= origin)]
                    ax.plot([p["minute"] for p in segment], [p[arm] for p in segment],
                            color=COLORS[kind], linestyle=style, linewidth=1.7,
                            label=LABELS[kind] if not future else None)
            train = [p for p in points if p["minute"] <= origin]
            future = [p for p in points if p["minute"] > origin]
            ax.scatter([p["minute"] for p in train], [p[arm] for p in train], color="#222222", s=27, zorder=5,
                       label="Avläst: anpassning")
            ax.scatter([p["minute"] for p in future], [p[arm] for p in future], facecolors="none", edgecolors="#222222", s=33,
                       zorder=5, label="Avläst: framtida punkter")
            targets = [p for p in future if p["minute"] in (origin+30, origin+60)]
            ax.scatter([p["minute"] for p in targets], [p[arm] for p in targets], color="#b14628", marker="x", s=55,
                       zorder=6, label="Utvärderade mål")
            if external or col == 1:
                last = next(p for p in points if p["minute"] == origin)[arm]
                ax.plot([origin, origin+60], [last, last], color="#a55a16", linestyle="--", label="Persistens")
            arm_label = "Utan lokal värme" if arm == "unheated" else "Med lokal värme"
            ax.set_title(arm_label + (" · kurvform och persistens" if external or col == 1 else " · ursprungliga modeller"))
            ax.set_xlim(-1, origin+63)
            ax.set_ylim(0, maximum*1.12+2)
            ax.set_xlabel("Minuter efter bolus")
            ax.set_ylabel("Insulininkrement (uU/mL)")
            ax.grid(alpha=0.17)

    boundary = ", ".join(m["kind"] for m in models if m["atGridBoundary"]) or "ingen"
    for col in range(len(columns)):
        handles, labels = axes[0][col].get_legend_handles_labels()
        fig.legend(handles, labels, fontsize=9, ncol=2, loc="upper center",
                   bbox_to_anchor=(0.5 if external else 0.26 if col == 0 else 0.76, 0.94), frameon=False)
    heading = "Separat publikation" if external else "Utforskande kurvformsjämförelse"
    fig.suptitle(f"{heading} · observationer till {origin} minuter", fontsize=15)
    fig.text(0.5, 0.055, "Solid linje: anpassning. Streckad linje och grå yta: prognos. Centrala avläsningar, inga osäkerhetsband.", ha="center", fontsize=9)
    doi = "10.1089/dia.2013.0187" if external else "10.1111/pedi.12001"
    fig.text(0.5, 0.032, f"Gränsträffar: {boundary}. Figur 2, DOI {doi} · avlästa gruppmedelvärden.", ha="center", fontsize=9)
    caveat = ("Separat figur, samma forskargrupp; deltagaröverlapp ej klarlagt. Ingen klinisk validering." if external
              else "Samma figur har redan analyserats. Ingen oberoende validering, individuell absorption eller blodsockerprognos.")
    fig.text(0.5, 0.009, caveat, ha="center", fontsize=9)
    fig.tight_layout(rect=(0, 0.085, 1, 0.81))
    files = []
    for extension in ("png", "svg"):
        prefix = "external-curve" if external else "curve-shape"
        target = directory / f"{prefix}-origin-{origin}.{extension}"
        fig.savefig(target, dpi=160)
        files.append({"file": target.name, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
    plt.close(fig)
    return files


def main():
    report_path = Path(sys.argv[1])
    if not report_path.exists():
        print("No saved report; no plots created.")
        return
    raw = report_path.read_bytes()
    report = json.loads(raw)
    cases = [c for c in report.get("cases", []) if c.get("hypothesisTest", {}).get("protocol", {}).get("id") in ("insulin-curve-shape-v1", "insulin-external-curve-v1")]
    files = []
    for case in cases:
        files.extend(plot_case(case, report_path.parent))
    if cases:
        manifest = {"schemaVersion": 1, "renderer": "matplotlib", "version": matplotlib.__version__,
                    "reportSha256": hashlib.sha256(raw).hexdigest(), "plots": files,
                    "scope": "Central digitization only; solid training / dashed forecast; no refitting or independent validation."}
        (report_path.parent / "curve-plots.json").write_text(json.dumps(manifest, indent=2)+"\n")
    print(f"Saved {len(files)} plot files for {len(cases)} completed cases.")


if __name__ == "__main__":
    main()
