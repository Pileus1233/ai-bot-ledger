import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { StatsCard } from "@/components/StatsCard";
import { TradeHistory } from "@/components/TradeHistory";
import { PerformanceChart } from "@/components/PerformanceChart";
import { Button } from "@/components/ui/button";
import { TrendingUp, DollarSign, Activity, Percent, RefreshCw, LogOut, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Session } from "@supabase/supabase-js";

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
  const [session, setSession] = useState<Session | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

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
        description: data.message || `Found ${data.trades_found} new trades`,
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
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      setSession(currentSession);
      if (!currentSession) {
        navigate("/auth");
      }
    });

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      if (!currentSession) {
        navigate("/auth");
      } else {
        fetchTrades();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!session) return;

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
  }, [session]);

  // Calculate statistics
  const totalTrades = trades.length;
  const tradesWithPL = trades.filter(t => t.profit_loss !== null && t.profit_loss !== undefined && !isNaN(t.profit_loss));
  const totalPL = tradesWithPL.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
  const winningTrades = tradesWithPL.filter(t => (t.profit_loss || 0) > 0).length;
  const winRate = tradesWithPL.length > 0 ? Math.round((winningTrades / tradesWithPL.length) * 100 * 10) / 10 : 0;

  const resetTrades = async () => {
    if (!confirm('Are you sure you want to delete all trades? This cannot be undone.')) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('trades')
        .delete()
        .eq('user_id', session?.user?.id);
        
      if (error) throw error;
      
      toast({
        title: "Trades Reset",
        description: "All trades have been deleted. You can now re-sync from Telegram.",
      });
      
      // Refresh trades list
      await fetchTrades();
    } catch (error) {
      console.error('Error resetting trades:', error);
      toast({
        title: "Reset Failed",
        description: "Could not reset trades",
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Trading Dashboard</h1>
            <p className="text-muted-foreground">Track your AI bot's performance</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button 
              onClick={syncTelegram} 
              disabled={syncing}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              Sync Telegram
            </Button>
            <Button 
              onClick={resetTrades}
              variant="destructive"
              size="sm"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button 
              onClick={handleSignOut}
              variant="outline"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
