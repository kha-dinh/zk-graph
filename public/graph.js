const height = 800;
const width = 600;

/*
 * Input file generated with
 * zk graph --format json > data/notes2.json
 */

d3.json("graph.json").then((json) => {

  // Create list of existing paths/IDs
  const validPaths = json.notes.map(n => n.path);

  // Filter broken links and format notes so that d3 can untderstand them
  const links = json.links
    .filter(edge => (validPaths.includes(edge.targetPath) && (validPaths.includes(edge.sourcePath))))
    .map((e) => {
      ne = {};
      ne.source = e.sourcePath;
      ne.target = e.targetPath;
      return ne;
    });

  const simulation = d3.forceSimulation(json.notes)
    .force("link", d3.forceLink(links).strength(2).id(d => d.path))
    .force("charge", d3.forceManyBody())
    .force("x", d3.forceX())
    .force("y", d3.forceY())
    .force("collide", d3.forceCollide().radius(20));


  const svg = d3.select("#graphcontainer").append("svg")
    .attr("viewBox", [-width / 2, -height / 2, width, height]);

  const link = svg.append("g")

    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke-width", d => Math.sqrt(d.value));

  // Create container to hold circles and labels together
  const container = svg.append("g")
    .selectAll("g")
    .data(json.notes)
    .enter()
    .append("g");

  container
    .call(drag(simulation))
    .on("click", (event) => {
      var objReq = new XMLHttpRequest();

      const file = event.srcElement.__data__.absPath;
      // console.log(event);
      console.log(file);
      objReq.open("GET", document.URL + "open" + "?file=" + file, false);
      objReq.send();
    })
    .on("mouseover", function(d) {
      d3.select(this).select("circle").style("fill-opacity", 0.6);
      d3.select(this).select("text").style("font-size", 10);
    })
    .on("mouseout", function(d) {
      d3.select(this).select("circle").style("fill-opacity", 1);
      d3.select(this).select("text").style("font-size", 7);
    })
    ;

  const circles = container.append("circle")
    .attr('r', 5)
    .attr("fill", "#1f77b4");

  const texts = container.append("text")
    .attr("x", 7)
    .attr("y", "0.31em")
    .style("font-size", 7)
    .text(d => d.title)
    ;

  container.append("title")
    .text(d => d.lead);

  simulation.on("tick", () => {

    container
      .attr("transform", d => "translate(" + d.x + ", " + d.y + ")");

    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

  });

  function drag(simulation) {
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);
  }

  // let linkedByIndex = {};
  // links.forEach(function(d) {
  //		linkedByIndex[d.source.index + "," + d.target.index] = 1;
  // });

  // function isConnected(a, b) {
  //		return linkedByIndex[a.index + "," + b.index] || linkedByIndex[b.index + "," + a.index] || a.index == b.index;
  // }

}).catch(console.error);
