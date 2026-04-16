import { useState, useEffect } from "react";

const CHIPS = [10, 25, 50, 100];

interface PointChipsProps {
  value: number;
  onChange: (val: number) => void;
  maxBalance: number;
}

const PointChips = ({ value, onChange, maxBalance }: PointChipsProps) => {
  const [customInput, setCustomInput] = useState("");

  useEffect(() => {
    if (CHIPS.includes(value)) {
      setCustomInput("");
    }
  }, [value]);

  const handleChip = (amount: number) => {
    const capped = Math.min(amount, maxBalance);
    onChange(capped);
    setCustomInput("");
  };

  const handleCustom = (raw: string) => {
    setCustomInput(raw);
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num > 0) {
      onChange(Math.min(num, maxBalance));
    } else if (raw === "") {
      onChange(0);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {CHIPS.map((c) => (
        <button
          key={c}
          onClick={() => handleChip(c)}
          disabled={maxBalance < 1}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${
            value === c && !customInput
              ? "bg-primary text-primary-foreground"
              : "bg-surface-container-high text-muted-foreground hover:text-foreground"
          }`}
        >
          {c}
        </button>
      ))}

      <input
        type="number"
        inputMode="numeric"
        placeholder="Custom"
        value={customInput}
        onChange={(e) => handleCustom(e.target.value)}
        className="w-20 py-2 px-2 rounded-xl text-xs font-bold text-center bg-surface-container-high text-foreground border border-border focus:border-primary focus:outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );
};

export default PointChips;
