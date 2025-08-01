// STL Loader for parsing binary STL files
class STLLoader {
  static async loadSTL(url) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return this.parseSTL(buffer);
  }

  static parseSTL(buffer) {
    const view = new DataView(buffer);
    
    // Skip 80-byte header
    let offset = 80;
    
    // Read number of triangles
    const numTriangles = view.getUint32(offset, true);
    offset += 4;
    
    const vertices = [];
    const normals = [];
    const indices = [];
    
    for (let i = 0; i < numTriangles; i++) {
      // Read normal vector (3 floats)
      const nx = view.getFloat32(offset, true);
      const ny = view.getFloat32(offset + 4, true);
      const nz = view.getFloat32(offset + 8, true);
      offset += 12;
      
      // Read 3 vertices (9 floats)
      for (let j = 0; j < 3; j++) {
        const x = view.getFloat32(offset, true);
        const y = view.getFloat32(offset + 4, true);
        const z = view.getFloat32(offset + 8, true);
        offset += 12;
        
        vertices.push(x, y, z);
        normals.push(nx, ny, nz);
        indices.push(vertices.length / 3 - 1);
      }
      
      // Skip attribute byte count
      offset += 2;
    }
    
    return {
      vertices: new Float32Array(vertices),
      normals: new Float32Array(normals),
      indices: new Uint16Array(indices),
      numTriangles
    };
  }
}

export default STLLoader;