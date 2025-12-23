"""
Neural Knowledge Graph Router
Advanced graph analysis, clustering, and pathfinding using NetworkX and scikit-learn.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import networkx as nx
import numpy as np
from sklearn.cluster import KMeans, DBSCAN
from sklearn.metrics.pairwise import cosine_similarity

router = APIRouter()

class Node(BaseModel):
    id: str
    embedding: Optional[List[float]] = None
    data: Optional[Dict[str, Any]] = {}

class Edge(BaseModel):
    source: str
    target: str
    weight: float = 1.0

class GraphInput(BaseModel):
    nodes: List[Node]
    edges: List[Edge] = []

class ClusterInput(BaseModel):
    nodes: List[Node]
    n_clusters: int = 5
    method: str = "kmeans" # kmeans, dbscan

class ClusterResult(BaseModel):
    clusters: Dict[str, List[str]] # cluster_id -> list of node_ids
    labels: Dict[str, int] # node_id -> cluster_id

class PathInput(BaseModel):
    nodes: List[Node]
    edges: List[Edge]
    source_id: str
    target_id: str
    max_depth: int = 5

class PathResult(BaseModel):
    found: bool
    path: List[str] = [] # List of node IDs
    length: int = 0

class CentralityResult(BaseModel):
    centrality: Dict[str, float] # node_id -> score

@router.post("/cluster", response_model=ClusterResult)
async def cluster_nodes(input: ClusterInput):
    """
    Cluster nodes based on their embeddings using K-Means or DBSCAN.
    """
    try:
        # Filter nodes with embeddings
        valid_nodes = [n for n in input.nodes if n.embedding]
        
        if not valid_nodes:
            # If no embeddings, cannot cluster semantically
            # Fallback: simple partitioning or error
            return ClusterResult(clusters={"0": [n.id for n in input.nodes]}, labels={n.id: 0 for n in input.nodes})
            
        embeddings = np.array([n.embedding for n in valid_nodes])
        node_ids = [n.id for n in valid_nodes]
        
        labels = []
        if input.method == "dbscan":
            # DBSCAN is density-based, good for finding outliers
            clustering = DBSCAN(eps=0.5, min_samples=2, metric='cosine').fit(embeddings)
            labels = clustering.labels_
        else:
            # K-Means default
            n_clusters = min(input.n_clusters, len(valid_nodes))
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10).fit(embeddings)
            labels = kmeans.labels_
            
        # Format result
        cluster_map = {}
        label_map = {}
        
        for i, label in enumerate(labels):
            lbl_str = str(label)
            nid = node_ids[i]
            
            if lbl_str not in cluster_map:
                cluster_map[lbl_str] = []
            cluster_map[lbl_str].append(nid)
            label_map[nid] = int(label)
            
        # Handle nodes without embeddings (assign to -1 or separate)
        for n in input.nodes:
            if n.id not in label_map:
                label_map[n.id] = -1
                if "-1" not in cluster_map:
                    cluster_map["-1"] = []
                cluster_map["-1"].append(n.id)
                
        return ClusterResult(clusters=cluster_map, labels=label_map)
        
    except Exception as e:
        print(f"Clustering error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/path", response_model=PathResult)
async def find_path(input: PathInput):
    """
    Find shortest path between nodes using NetworkX.
    Uses edge weights if provided (Dijkstra), otherwise BFS.
    """
    try:
        G = nx.Graph()
        
        for node in input.nodes:
            G.add_node(node.id)
            
        for edge in input.edges:
            # Determine weight: use provided weight or convert similarity to distance (1 - similarity)
            # Typically higher weight = stronger connection.
            # NetworkX shortest_path minimizes sum of weights.
            # So if weight represents strength, we should invert it or use max_weight path (not standard).
            # Let's assume input edges have 'distance' or we strictly look for connectivity.
            # For simplicity here: standard unweighted BFS or weighted Dijkstra if weight is distance.
            
            # Here we assume weight is STRENGTH (0-1). 
            # To find 'strongest' path, we can either:
            # 1. Use 1/weight as distance
            # 2. Use BFS (fewest hops)
            
            distance = 1.0 / max(edge.weight, 0.001)
            G.add_edge(edge.source, edge.target, weight=distance)
            
        if not G.has_node(input.source_id) or not G.has_node(input.target_id):
             return PathResult(found=False, path=[], length=0)
             
        try:
            path = nx.shortest_path(G, source=input.source_id, target=input.target_id, weight="weight")
            return PathResult(found=True, path=path, length=len(path)-1)
        except nx.NetworkXNoPath:
            return PathResult(found=False, path=[], length=0)
            
    except Exception as e:
        print(f"Pathfinding error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/centrality", response_model=CentralityResult)
async def calculate_centrality(input: GraphInput):
    """
    Calculate PageRank or Degree Centrality to find most important nodes.
    """
    try:
        G = nx.Graph()
        for node in input.nodes:
            G.add_node(node.id)
        for edge in input.edges:
            G.add_edge(edge.source, edge.target, weight=edge.weight)
            
        # PageRank (weighted)
        if len(input.nodes) > 0:
            pagerank = nx.pagerank(G, weight='weight')
            return CentralityResult(centrality=pagerank)
        else:
             return CentralityResult(centrality={})
             
    except Exception as e:
        print(f"Centrality error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
