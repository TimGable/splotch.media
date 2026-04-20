export function InteractiveBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#050505]">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(180deg, #1a1a1a 0px, #020202 1600px, #1a1a1a 3200px)",
          backgroundRepeat: "repeat-y",
          backgroundSize: "100% 3200px",
        }}
      />
      <div className="absolute inset-0 bg-[#050505]/25" />
      <div
        className="absolute inset-0 opacity-46"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.07) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />
    </div>
  );
}
