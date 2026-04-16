import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import RatingEvolutionChart from "@/components/RatingEvolutionChart";

// Mock supabase
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: (...args: any[]) => {
        mockSelect(...args);
        return {
          eq: (...eqArgs: any[]) => {
            mockEq(...eqArgs);
            return {
              order: (...orderArgs: any[]) => {
                mockOrder(...orderArgs);
                return {
                  limit: (...limitArgs: any[]) => {
                    mockLimit(...limitArgs);
                    return mockLimit.getMockImplementation()?.(...limitArgs) ?? { data: null };
                  },
                };
              },
            };
          },
        };
      },
    }),
  },
}));

// Mock ResizeObserver for recharts ResponsiveContainer
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = ResizeObserverMock;

const mockHistory = [
  { new_level: 3.5, level_change: 0.15, actual_result: 1, created_at: "2026-03-01T10:00:00Z" },
  { new_level: 3.65, level_change: 0.15, actual_result: 1, created_at: "2026-03-03T10:00:00Z" },
  { new_level: 3.45, level_change: -0.2, actual_result: 0, created_at: "2026-03-05T10:00:00Z" },
  { new_level: 3.55, level_change: 0.1, actual_result: 1, created_at: "2026-03-07T10:00:00Z" },
];

describe("RatingEvolutionChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when fewer than 2 data points", async () => {
    mockLimit.mockImplementation(() => ({ data: [mockHistory[0]] }));

    render(<RatingEvolutionChart userId="user-123" />);

    await waitFor(() => {
      expect(screen.getByText(/Play more rated matches/)).toBeInTheDocument();
    });
  });

  it("shows empty state when no data", async () => {
    mockLimit.mockImplementation(() => ({ data: [] }));

    render(<RatingEvolutionChart userId="user-123" />);

    await waitFor(() => {
      expect(screen.getByText(/Play more rated matches/)).toBeInTheDocument();
    });
  });

  it("renders chart header and legend when data is available", async () => {
    mockLimit.mockImplementation(() => ({ data: mockHistory }));

    render(<RatingEvolutionChart userId="user-123" />);

    await waitFor(() => {
      expect(screen.getByText("Level Evolution")).toBeInTheDocument();
    });

    expect(screen.getByText(`Last ${mockHistory.length} matches`)).toBeInTheDocument();
    expect(screen.getByText("Win")).toBeInTheDocument();
    expect(screen.getByText("Loss")).toBeInTheDocument();
    expect(screen.getByText("Draw")).toBeInTheDocument();
  });

  it("queries supabase with correct user id", async () => {
    mockLimit.mockImplementation(() => ({ data: mockHistory }));

    render(<RatingEvolutionChart userId="test-user-abc" />);

    await waitFor(() => {
      expect(mockEq).toHaveBeenCalledWith("user_id", "test-user-abc");
    });
  });

  it("shows loading spinner initially", () => {
    mockLimit.mockImplementation(() => new Promise(() => {})); // never resolves

    render(<RatingEvolutionChart userId="user-123" />);

    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });
});
