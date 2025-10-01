import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatsCard } from "@/components/StatsCard";
import { TradesTable } from "@/components/TradesTable";
import { PerformanceChart } from "@/components/PerformanceChart";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Activity, Percent, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Trade {
  id: string;
  symbol: string;
  action: string;
  price: number;
  quantity?: number;
  profit_loss?: number;
  timestamp: string;
}

const Index = () => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchTrades = async () => {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching trades:', error);
      return;
    }

    setTrades(data || []);
  };

  const syncTelegram = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-telegram-trades');
      
      if (error) throw error;
      
      toast({
        title: "Synced!",
        description: `Found ${data.tradesFound} new trades from Telegram`,
      });
      
      await fetchTrades();
    } catch (error) {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('trades-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades'
        },
        () => {
          fetchTrades();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const totalTrades = trades.length;
  const profitableTrades = trades.filter(t => t.profit_loss && t.profit_loss > 0).length;
  const losingTrades = trades.filter(t => t.profit_loss && t.profit_loss < 0).length;
  const winRate = totalTrades > 0 ? ((profitableTrades / (profitableTrades + losingTrades)) * 100) : 0;
  const totalPnL = trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);

  // Generate chart data
  const chartData = trades
    .filter(t => t.profit_loss !== null && t.profit_loss !== undefined)
    .reverse()
    .reduce((acc, trade, idx) => {
      const prevValue = idx > 0 ? acc[idx - 1].value : 0;
      acc.push({
        date: new Date(trade.timestamp).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' }),
        value: prevValue + (trade.profit_loss || 0)
      });
      return acc;
    }, [] as { date: string; value: number }[]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">AI Trading Bot</h1>
            <p className="text-muted-foreground">Performance Dashboard</p>
          </div>
          <Button 
            onClick={syncTelegram} 
            disabled={loading}
            className="bg-primary hover:bg-primary/90"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Sync Telegram
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Trades"
            value={totalTrades}
            icon={Activity}
          />
          <StatsCard
            title="Win Rate"
            value={`${winRate.toFixed(1)}%`}
            icon={Percent}
          />
          <StatsCard
            title="Profitable"
            value={profitableTrades}
            icon={TrendingUp}
          />
          <StatsCard
            title="Total P/L"
            value={`$${totalPnL.toFixed(2)}`}
            icon={totalPnL >= 0 ? TrendingUp : TrendingDown}
            trend={{
              value: `${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}`,
              positive: totalPnL >= 0
            }}
          />
        </div>

        {/* Performance Chart */}
        {chartData.length > 0 && <PerformanceChart data={chartData} />}

        {/* Trades Table */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Recent Trades</h2>
          {trades.length > 0 ? (
            <TradesTable trades={trades} />
          ) : (
            <div className="rounded-lg border border-border/50 bg-card/50 p-12 text-center backdrop-blur-sm">
              <p className="text-muted-foreground">No trades found. Click "Sync Telegram" to fetch trades.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;