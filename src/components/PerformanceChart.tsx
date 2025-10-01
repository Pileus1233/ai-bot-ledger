import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface Trade {
  timestamp: string;
  profit_loss?: number;
}

interface PerformanceChartProps {
  trades: Trade[];
}

export const PerformanceChart = ({ trades }: PerformanceChartProps) => {
  // Calculate cumulative P/L over time
  const data = trades
    .filter(t => t.profit_loss !== null && t.profit_loss !== undefined)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .reduce((acc, trade, index) => {
      const cumulative = index === 0 
        ? (trade.profit_loss || 0) 
        : acc[index - 1].value + (trade.profit_loss || 0);
      
      return [
        ...acc,
        {
          date: new Date(trade.timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
          value: cumulative,
        }
      ];
    }, [] as { date: string; value: number }[]);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle>Performance Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
            <XAxis 
              dataKey="date" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.5rem'
              }}
            />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="hsl(var(--chart-1))" 
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--chart-1))', r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No P/L data available yet
          </div>
        )}
      </CardContent>
    </Card>
  );
};