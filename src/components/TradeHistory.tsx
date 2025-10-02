import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { format } from "date-fns";

interface Trade {
  id: string;
  symbol: string;
  action: string;
  price: number;
  quantity?: number;
  profit_loss?: number;
  timestamp: string;
}

interface TradeHistoryProps {
  trades: Trade[];
}

export const TradeHistory = ({ trades }: TradeHistoryProps) => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('sv-SE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(price);
  };

  const formatProfitLoss = (value?: number) => {
    if (value === undefined || value === null) return '-';
    const formatted = new Intl.NumberFormat('sv-SE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: 'always'
    }).format(value);
    return formatted;
  };

  return (
    <Card className="p-4 md:p-6 bg-card border-border">
      <h2 className="text-lg md:text-xl font-bold text-foreground mb-4">Trade History</h2>
      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-muted/50">
              <TableHead className="text-muted-foreground">Time</TableHead>
              <TableHead className="text-muted-foreground">Symbol</TableHead>
              <TableHead className="text-muted-foreground">Action</TableHead>
              <TableHead className="text-muted-foreground text-right">Price</TableHead>
              <TableHead className="text-muted-foreground text-right">Quantity</TableHead>
              <TableHead className="text-muted-foreground text-right">P/L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.map((trade) => (
              <TableRow key={trade.id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="text-foreground font-medium">
                  {format(new Date(trade.timestamp), 'HH:mm:ss')}
                </TableCell>
                <TableCell className="text-foreground font-semibold">{trade.symbol}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                    trade.action === 'BUY' || trade.action === 'LONG' 
                      ? 'bg-success/10 text-success' 
                      : 'bg-loss/10 text-loss'
                  }`}>
                    {trade.action === 'BUY' || trade.action === 'LONG' ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {trade.action}
                  </span>
                </TableCell>
                <TableCell className="text-right text-foreground">${formatPrice(trade.price)}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {trade.quantity ? formatPrice(trade.quantity) : '-'}
                </TableCell>
                <TableCell className={`text-right font-semibold ${
                  trade.profit_loss && trade.profit_loss > 0 
                    ? 'text-success' 
                    : trade.profit_loss && trade.profit_loss < 0 
                    ? 'text-loss' 
                    : 'text-muted-foreground'
                }`}>
                  {formatProfitLoss(trade.profit_loss)}
                </TableCell>
              </TableRow>
            ))}
            {trades.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No trades yet. Start trading to see your history!
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};
