import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface Trade {
  id: string;
  symbol: string;
  action: string;
  price: number;
  quantity?: number;
  profit_loss?: number;
  timestamp: string;
}

interface TradesTableProps {
  trades: Trade[];
}

export const TradesTable = ({ trades }: TradesTableProps) => {
  const getActionColor = (action: string) => {
    switch (action) {
      case 'BUY':
      case 'LONG':
        return 'bg-success/20 text-success border-success/50';
      case 'SELL':
      case 'SHORT':
        return 'bg-loss/20 text-loss border-loss/50';
      case 'CLOSE':
        return 'bg-muted text-muted-foreground border-muted-foreground/50';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm">
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableHead>Symbol</TableHead>
            <TableHead>Action</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">P/L</TableHead>
            <TableHead className="text-right">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade) => (
            <TableRow key={trade.id} className="border-border/50">
              <TableCell className="font-medium">{trade.symbol}</TableCell>
              <TableCell>
                <Badge variant="outline" className={getActionColor(trade.action)}>
                  {trade.action}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono">${trade.price.toFixed(2)}</TableCell>
              <TableCell className="text-right font-mono">
                {trade.quantity ? trade.quantity.toFixed(4) : '-'}
              </TableCell>
              <TableCell className="text-right font-mono">
                {trade.profit_loss !== null && trade.profit_loss !== undefined ? (
                  <span className={trade.profit_loss >= 0 ? 'text-success' : 'text-loss'}>
                    {trade.profit_loss >= 0 ? '+' : ''}${trade.profit_loss.toFixed(2)}
                  </span>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatDistanceToNow(new Date(trade.timestamp), { addSuffix: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};