import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatsCard } from "@/components/StatsCard";
import { TradeHistory } from "@/components/TradeHistory";
import { PerformanceChart } from "@/components/PerformanceChart";
import { Button } from "@/components/ui/button";
import { TrendingUp, DollarSign, Activity, Percent, RefreshCw } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const fetchTrades = async () => {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching trades:', error);
      toast({
        title: "Error",
        description: "Failed to fetch trades",
        variant: "destructive",
      });
    } else {
      setTrades(data || []);
    }
    setLoading(false);
  };

  const syncTelegram = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-telegram-trades');
      
      if (error) throw error;

      toast({
        title: "Sync Complete",
        description: `Found ${data.trades_found} new trades`,
      });

      // Refresh trades list
      await fetchTrades();
    } catch (error) {
      console.error('Error syncing:', error);
      toast({
        title: "Sync Failed",
        description: "Could not sync with Telegram",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
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

  // Calculate statistics
  const totalTrades = trades.length;
  const tradesWithPL = trades.filter(t => t.profit_loss !== null && t.profit_loss !== undefined);
  const totalPL = tradesWithPL.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
  const winningTrades = tradesWithPL.filter(t => (t.profit_loss || 0) > 0).length;
  const winRate = tradesWithPL.length > 0 ? (winningTrades / tradesWithPL.length) * 100 : 0;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Trading Dashboard</h1>
            <p className="text-muted-foreground">Track your AI bot's performance</p>
          </div>
          <Button 
            onClick={syncTelegram} 
            disabled={syncing}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Sync Telegram
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Total Trades"
            value={totalTrades}
            icon={Activity}
          />
          <StatsCard
            title="Total P/L"
            value={`$${totalPL.toFixed(2)}`}
            icon={DollarSign}
            trend={{
              value: totalPL >= 0 ? 'Profitable' : 'In Loss',
              positive: totalPL >= 0
            }}
          />
          <StatsCard
            title="Win Rate"
            value={`${winRate.toFixed(1)}%`}
            icon={Percent}
          />
          <StatsCard
            title="Winning Trades"
            value={`${winningTrades}/${tradesWithPL.length}`}
            icon={TrendingUp}
          />
        </div>

        {/* Chart */}
        <PerformanceChart trades={trades} />

        {/* Trade History */}
        <TradeHistory trades={trades.slice(0, 20)} />
      </div>
    </div>
  );
};

export default Index;
