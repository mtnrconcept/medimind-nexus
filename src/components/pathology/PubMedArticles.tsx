import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { Search, ExternalLink, RefreshCw, BookOpen } from 'lucide-react';

interface PubMedArticle {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  pubDate: string;
  url: string;
}

interface PubMedArticlesProps {
  pathologyName: string;
}

const PubMedArticles = ({ pathologyName }: PubMedArticlesProps) => {
  const [articles, setArticles] = useState<PubMedArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(pathologyName);
  const [hasSearched, setHasSearched] = useState(false);

  const fetchArticles = async (query: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('pubmed-search', {
        body: { query, maxResults: 10 },
      });

      if (fnError) throw fnError;
      
      setArticles(data?.articles || []);
      setHasSearched(true);
    } catch (err) {
      console.error('Error fetching PubMed articles:', err);
      setError('Impossible de récupérer les articles PubMed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (pathologyName) {
      setSearchQuery(pathologyName);
    }
  }, [pathologyName]);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      fetchArticles(searchQuery.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Articles PubMed
        </CardTitle>
        <CardDescription>
          Recherche en temps réel dans la base PubMed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Rechercher des articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={loading}>
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 rounded-lg border space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="text-center py-4 text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && hasSearched && articles.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            Aucun article trouvé pour cette recherche
          </div>
        )}

        {!loading && !error && !hasSearched && (
          <div className="text-center py-4 text-muted-foreground">
            Cliquez sur rechercher pour charger les articles
          </div>
        )}

        {!loading && articles.length > 0 && (
          <div className="space-y-3">
            {articles.map((article) => (
              <div
                key={article.pmid}
                className="p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-xs">
                        PubMed
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">
                        PMID: {article.pmid}
                      </span>
                    </div>
                    <h4 className="font-medium text-sm leading-snug line-clamp-2">
                      {article.title}
                    </h4>
                    {article.authors.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {article.authors.slice(0, 3).join(', ')}
                        {article.authors.length > 3 && ' et al.'}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {article.journal && <span>{article.journal}</span>}
                      {article.pubDate && (
                        <>
                          <span>•</span>
                          <span>{article.pubDate}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0"
                  >
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PubMedArticles;
