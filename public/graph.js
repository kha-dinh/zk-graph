// Configuration object for graph settings
const CONFIG = {
  dimensions: {
    width: 1200,
    height: 1200,
  },
  node: {
    baseRadius: 7,
    radiusMultiplier: 0.5,
    fill: "#1f77b4",
    highlightFill: "#ff6b6b", // Highlight color for nodes
    fontSize: 0,
    hoverFontSize: 25,
    textColor: "#333333", // Added text color configuration
    textYOffset: 30, // Added offset for text below node
    dimOpacity: 0.2,
    highlightOpacity: 1,
    transitionDuration: 300,
  },
  link: {
    stroke: "#999",
    highlightStroke: "#ff6b6b",
    opacity: 1,
    strength: 2,
    dimOpacity: 0.2,
    highlightOpacity: 1,
    arrowSize: 3, // Size of the arrow marker
  },
  forces: {
    centerForce: 0.2, // How strongly nodes are pulled to the center (0-1)
    repelForce: -500, // How strongly nodes push away from each other
    linkForce: 0.3, // How strongly connected nodes pull together (0-1)
    linkDistance: 50, // Base distance between connected nodes
  },
  zoom: {
    min: 0.1,
    max: 10,
    defaultScale: 0.6,
  },
};

class GraphVisualizer {
  constructor(containerId) {
    this.containerId = containerId;
    this.svg = null;
    this.simulation = null;
    this.zoomGroup = null;
    this.nodes = null;
    this.links = null;
  }

  async initialize(dataUrl) {
    try {
      const graphData = await d3.json(dataUrl);
      const processedData = this.processGraphData(graphData);
      this.setupSimulation(processedData);
      this.createVisualization(processedData);
      this.setupZoom();
    } catch (error) {
      console.error("Failed to initialize graph:", error);
    }
  }

  processGraphData(rawData) {
    const validPaths = rawData.notes.map((note) => note.path);

    const links = rawData.links
      .filter(
        (edge) =>
          validPaths.includes(edge.targetPath) &&
          validPaths.includes(edge.sourcePath),
      )
      .map((edge) => ({
        source: edge.sourcePath,
        target: edge.targetPath,
      }));

    const connectionCounts = this.calculateConnectionCounts(
      rawData.notes,
      links,
    );

    const nodes = rawData.notes.map((note) => ({
      ...note,
      connections: connectionCounts[note.path] || 0,
    }));

    return { nodes, links };
  }

  calculateConnectionCounts(nodes, links) {
    const counts = Object.fromEntries(nodes.map((node) => [node.path, 0]));

    links.forEach((link) => {
      counts[link.source]++;
      counts[link.target]++;
    });

    return counts;
  }

  setupSimulation(data) {
    // Calculate the maximum number of connections for normalization
    const maxConnections = Math.max(
      ...data.nodes.map((node) => node.connections),
    );

    this.simulation = d3
      .forceSimulation(data.nodes)
      // Center force - pulls nodes toward the center, stronger for well-connected nodes
      .force(
        "x",
        d3.forceX().strength((d) => {
          // Normalize connections to get a value between 0 and 1
          const connectionStrength = d.connections / maxConnections;
          // More connections = stronger pull to center
          return CONFIG.forces.centerForce * (1 + connectionStrength);
        }),
      )
      .force(
        "y",
        d3.forceY().strength((d) => {
          const connectionStrength = d.connections / maxConnections;
          return CONFIG.forces.centerForce * (1 + connectionStrength);
        }),
      )

      // Repel force - pushes nodes away from each other
      .force("charge", d3.forceManyBody().strength(CONFIG.forces.repelForce))

      // Link force - maintains connections between nodes
      .force(
        "link",
        d3
          .forceLink(data.links)
          .id((d) => d.path)
          .strength(CONFIG.forces.linkForce)
          .distance(CONFIG.forces.linkDistance),
      );

    // These x and y forces are now handled in the center force above

    // Adjust simulation parameters for stability
    this.simulation
      .alphaDecay(0.02) // Slower cooling
      .velocityDecay(0.2) // More momentum
      .alpha(0.5)
      .restart();
  }

  createVisualization(data) {
    this.createSvgContainer();
    this.zoomGroup = this.svg.append("g").attr("class", "zoom-group");

    // Store references to nodes and links
    this.links = this.createLinks(data.links);
    this.nodes = this.createNodeGroups(data.nodes);

    this.setupSimulationTick(this.nodes, this.links);
  }

  createSvgContainer() {
    const { width, height } = CONFIG.dimensions;
    this.svg = d3
      .select(`#${this.containerId}`)
      .append("svg")
      .attr("viewBox", [-width / 2, -height / 2, width, height]);
  }

  setupZoom() {
    const zoom = d3
      .zoom()
      .scaleExtent([CONFIG.zoom.min, CONFIG.zoom.max])
      .on("zoom", (event) => {
        this.zoomGroup.attr("transform", event.transform);
      });

    this.svg
      .call(zoom)
      .call(zoom.transform, d3.zoomIdentity.scale(CONFIG.zoom.defaultScale));
  }

  createLinks(links) {
    return this.zoomGroup
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", CONFIG.link.stroke)
      .attr("stroke-opacity", CONFIG.link.opacity)
      .attr("stroke-width", 1);
  }

  createNodeGroups(nodes) {
    const container = this.zoomGroup
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodes)
      .join("g");

    // Add circles to nodes
    container
      .append("circle")
      .attr(
        "r",
        (d) =>
          CONFIG.node.baseRadius + d.connections * CONFIG.node.radiusMultiplier,
      )
      .attr("fill", CONFIG.node.fill);

    // Add labels to nodes with updated positioning and color
    container
      .append("text")
      .attr(
        "dy",
        (d) =>
          CONFIG.node.baseRadius +
          d.connections * CONFIG.node.radiusMultiplier +
          CONFIG.node.textYOffset,
      )
      .attr("text-anchor", "middle") // Center the text below the node
      .style("fill", CONFIG.node.textColor) // Set text color
      .style("font-size", CONFIG.node.fontSize)
      .style("opacity", 0)
      .text((d) => d.title);

    // Add tooltips
    container
      .append("title")
      .text((d) => `${d.title}\nConnections: ${d.connections}`);

    this.setupNodeInteractions(container);
    return container;
  }

  getConnectedNodes(sourceNode) {
    const connected = new Set();
    const links = this.simulation.force("link").links();

    links.forEach((link) => {
      if (link.source.path === sourceNode.path) {
        connected.add(link.target.path);
      } else if (link.target.path === sourceNode.path) {
        connected.add(link.source.path);
      }
    });

    return connected;
  }

  getConnectedLinks(sourceNode) {
    const connectedLinks = new Set();
    const links = this.simulation.force("link").links();

    links.forEach((link) => {
      if (
        link.source.path === sourceNode.path ||
        link.target.path === sourceNode.path
      ) {
        connectedLinks.add(link);
      }
    });

    return connectedLinks;
  }

  setupNodeInteractions(container) {
    // Create drag behavior
    const drag = d3
      .drag()
      .on("start", (event, d) => {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    container
      .call(drag)
      .on("mouseover", (event, d) => {
        // Only trigger if hovering over the circle
        if (event.target.tagName !== "circle") return;

        const connectedNodes = this.getConnectedNodes(d);
        const connectedLinks = this.getConnectedLinks(d);

        // Dim all nodes initially
        this.zoomGroup
          .selectAll(".nodes g")
          .style("transition", `opacity ${CONFIG.node.transitionDuration}ms`)
          .style("opacity", CONFIG.node.dimOpacity)
          .select("circle")
          .style("transition", `fill ${CONFIG.node.transitionDuration}ms`)
          .style("fill", CONFIG.node.fill);

        // Highlight connected nodes
        this.zoomGroup
          .selectAll(".nodes g")
          .filter((n) => n.path === d.path || connectedNodes.has(n.path))
          .style("transition", `opacity ${CONFIG.node.transitionDuration}ms`)
          .style("opacity", CONFIG.node.highlightOpacity)
          .select("circle")
          .style("transition", `fill ${CONFIG.node.transitionDuration}ms`)
          .style("fill", CONFIG.node.highlightFill);

        // Show text for hovered node only
        d3.select(event.currentTarget)
          .select("text")
          // .style(
          //   "transition",
          //   `opacity ${CONFIG.node.transitionDuration}ms, font-size ${CONFIG.node.transitionDuration}ms`,
          // )
          .style("opacity", 1)
          .style("font-size", CONFIG.node.hoverFontSize);

        // Dim all links
        this.zoomGroup
          .selectAll(".links line")
          .style(
            "transition",
            `opacity ${CONFIG.link.transitionDuration}ms, stroke ${CONFIG.link.transitionDuration}ms, stroke-width ${CONFIG.link.transitionDuration}ms`,
          )
          .style("opacity", CONFIG.link.dimOpacity)
          .style("stroke", CONFIG.link.stroke)
          .style("stroke-width", 1);

        // Highlight connected links
        this.zoomGroup
          .selectAll(".links line")
          .filter((l) => connectedLinks.has(l))
          .style(
            "transition",
            `opacity ${CONFIG.link.transitionDuration}ms, stroke ${CONFIG.link.transitionDuration}ms, stroke-width ${CONFIG.link.transitionDuration}ms`,
          )
          .style("opacity", CONFIG.link.highlightOpacity)
          .style("stroke", CONFIG.link.highlightStroke)
          .style("stroke-width", 2);
      })
      .on("mouseout", (event) => {
        // Only trigger if leaving the circle
        if (event.target.tagName !== "circle") return;
        // Reset all nodes
        this.zoomGroup
          .selectAll(".nodes g")
          .style("transition", `opacity ${CONFIG.node.transitionDuration}ms`)
          .style("opacity", CONFIG.node.highlightOpacity)
          .select("circle")
          .style("transition", `fill ${CONFIG.node.transitionDuration}ms`)
          .style("fill", CONFIG.node.fill);

        // Hide all text
        this.zoomGroup
          .selectAll("text")
          // .style(
          //   "transition",
          //   `opacity ${CONFIG.node.transitionDuration}ms, font-size ${CONFIG.node.transitionDuration}ms`,
          // )
          .style("opacity", 0)
          .style("font-size", CONFIG.node.fontSize);

        // Reset all links
        this.zoomGroup
          .selectAll(".links line")
          .style(
            "transition",
            `opacity ${CONFIG.link.transitionDuration}ms, stroke ${CONFIG.link.transitionDuration}ms, stroke-width ${CONFIG.link.transitionDuration}ms`,
          )
          .style("opacity", CONFIG.link.opacity)
          .style("stroke", CONFIG.link.stroke)
          .style("stroke-width", 1);
      })
      .on("click", this.handleNodeClick);
  }

  handleNodeClick(event) {
    const file = event.srcElement.__data__.absPath;
    const request = new XMLHttpRequest();
    request.open("GET", document.URL + "open" + "?file=" + file, false);
    request.send();
  }

  setupSimulationTick(nodeGroups, links) {
    this.simulation.on("tick", () => {
      nodeGroups.attr("transform", (d) => `translate(${d.x}, ${d.y})`);

      links
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
    });
  }
}

// Usage
const graph = new GraphVisualizer("graphcontainer");
graph.initialize("graph.json");
